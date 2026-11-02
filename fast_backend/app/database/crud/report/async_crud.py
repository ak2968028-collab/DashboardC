import json

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.crud.base.async_base import CrudBase
from app.database.crud.village.async_crud import SECTOR_COLUMNS, _joined
from app.database.models import (
    BlockBoundary, Demographics, DistrictBoundary, Village, VillageBoundary, VillageEmissions,
)

E = VillageEmissions

# Douglas-Peucker tolerance (degrees, ~1 m = 0.00001) for the district-wide maps; the village itself is drawn unsimplified.
OVERVIEW_TOLERANCE = 0.0004


def _geojson(geom, tolerance: float | None = None):
    shape = func.ST_SimplifyPreserveTopology(geom, tolerance) if tolerance else geom
    return func.ST_AsGeoJSON(shape, 6)


class Report_crud(CrudBase):
    """Map geometry and benchmark figures for the village PDF reports."""

    def __init__(self, db: AsyncSession, Model=VillageBoundary):
        super().__init__(db, Model)

    async def get_map_layers(self, village_code: str) -> dict:
        """District outline, block outlines (+ label points), every village polygon (+ per-capita emission) and the village."""
        district = await self.db.scalar(select(_geojson(DistrictBoundary.geom, OVERVIEW_TOLERANCE)).limit(1))
        blocks = await self.db.execute(select(
            BlockBoundary.block_name, _geojson(BlockBoundary.geom, OVERVIEW_TOLERANCE).label("geom"),
            func.ST_X(func.ST_PointOnSurface(BlockBoundary.geom)).label("x"),
            func.ST_Y(func.ST_PointOnSurface(BlockBoundary.geom)).label("y"),
        ))
        villages = await self.db.execute(
            select(VillageBoundary.village_code, _geojson(VillageBoundary.geom, OVERVIEW_TOLERANCE).label("geom"),
                   E.per_capita_co2e_kg_yr)
            .outerjoin(Village, Village.village_code == VillageBoundary.village_code)
            .outerjoin(E, E.village_id == Village.id)
        )
        target = (await self.db.execute(select(
            _geojson(VillageBoundary.geom).label("geom"),
            (func.ST_Area(func.Geography(VillageBoundary.geom)) / 10_000).label("area_ha"),
            func.ST_X(func.ST_Centroid(VillageBoundary.geom)).label("x"),
            func.ST_Y(func.ST_Centroid(VillageBoundary.geom)).label("y"),
        ).where(VillageBoundary.village_code == village_code))).mappings().first()
        return {
            "district": json.loads(district) if district else None,
            "blocks": [{"name": b.block_name, "geom": json.loads(b.geom), "label": (b.x, b.y)} for b in blocks],
            "villages": [{"code": v.village_code, "geom": json.loads(v.geom), "per_capita": v.per_capita_co2e_kg_yr}
                         for v in villages],
            "village": {**dict(target), "geom": json.loads(target["geom"])} if target else None,
        }

    async def get_benchmarks(self, village_code: str, block_name: str) -> dict:
        """Rank of the village and per-capita emissions (kg CO2e / person / yr) for its block and the district."""
        ranked = select(
            Village.village_code,
            func.rank().over(order_by=E.per_capita_co2e_kg_yr).label("per_capita_rank"),
            func.rank().over(order_by=E.total_co2e_t_yr).label("total_rank"),
            func.rank().over(partition_by=Village.block_name, order_by=E.per_capita_co2e_kg_yr).label("block_rank"),
            func.count().over().label("villages"),
            func.count().over(partition_by=Village.block_name).label("block_villages"),
        ).join(E, E.village_id == Village.id).subquery()
        rank = (await self.db.execute(select(ranked).where(ranked.c.village_code == village_code))).mappings().first()

        def per_capita(where=None):
            # Sum of emissions / sum of population, so large villages weigh more than in an average of ratios.
            pop = func.nullif(func.sum(Demographics.total_residents), 0)
            columns = {"total": E.total_co2e_t_yr, **SECTOR_COLUMNS}
            query = _joined(*[(func.coalesce(func.sum(col), 0) * 1000 / pop).label(name) for name, col in columns.items()])
            return query.where(where) if where is not None else query

        block = (await self.db.execute(per_capita(Village.block_name == block_name))).mappings().one()
        district = (await self.db.execute(per_capita())).mappings().one()
        return {"rank": dict(rank) if rank else None, "block": dict(block), "district": dict(district)}
