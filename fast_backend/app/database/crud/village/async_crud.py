from sqlalchemy import func, literal_column, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.crud.base.async_base import CrudBase
from app.database.models import (
    Demographics, EnergyConsumption, LandUse, LivestockPopulation, TransportActivity, Village,
    VillageEmissions, WasteManagement, WaterResources,
)

E = VillageEmissions

EMISSION_COLUMNS = [
    E.lpg_co2e_t_yr, E.firewood_co2e_t_yr, E.electricity_co2e_t_yr, E.energy_total_co2e_t_yr,
    E.transport_co2e_t_yr, E.waste_co2e_t_yr, E.livestock_co2e_t_yr, E.total_co2e_t_yr, E.per_capita_co2e_kg_yr,
]

# Flat village record used by the dashboard list, map, ranking & comparison.
LIST_COLUMNS = [
    Village.id.label("village_id"), Village.village_code, Village.village_name, Village.block_name,
    Village.subdistrict, Village.latitude, Village.longitude,
    Demographics.total_residents, Demographics.total_households,
    LandUse.total_area_ha, LandUse.builtup_area_ha, LandUse.agri_area_ha,
    WaterResources.total_water_area_ha,
    EnergyConsumption.lpg_monthly_kg, EnergyConsumption.firewood_monthly_kg, EnergyConsumption.electricity_monthly_kwh,
    WasteManagement.waste_monthly_kg,
    TransportActivity.motorbikes_count, TransportActivity.petrol_monthly_litres,
    LivestockPopulation.cows_count, LivestockPopulation.goats_count, LivestockPopulation.sheep_count,
    LivestockPopulation.total_livestock,
    *EMISSION_COLUMNS,
]

# Complete record of all 12 parameters for one village.
DETAIL_COLUMNS = LIST_COLUMNS + [
    Village.district, Village.state, Village.data_status, Village.created_at, Village.modified_at,
    Demographics.total_male, Demographics.total_female,
    LandUse.forest_area_ha, LandUse.barren_area_ha, LandUse.culturable_waste_ha, LandUse.fallow_land_ha,
    LandUse.remaining_area_ha,
    WaterResources.pond_area_ha, WaterResources.river_area_ha, WaterResources.canal_area_ha,
    WaterResources.well_irrig_area_ha, WaterResources.other_water_ha,
]

# Inputs needed by the carbon model.
ACTIVITY_COLUMNS = [
    Village.id.label("village_id"), Demographics.total_residents,
    EnergyConsumption.lpg_monthly_kg, EnergyConsumption.firewood_monthly_kg, EnergyConsumption.electricity_monthly_kwh,
    WasteManagement.waste_monthly_kg, TransportActivity.petrol_monthly_litres,
    LivestockPopulation.cows_count, LivestockPopulation.goats_count, LivestockPopulation.sheep_count,
]

SECTOR_COLUMNS = {
    "LPG Energy": E.lpg_co2e_t_yr,
    "Firewood Energy": E.firewood_co2e_t_yr,
    "Electricity Energy": E.electricity_co2e_t_yr,
    "Transport (Petrol)": E.transport_co2e_t_yr,
    "Solid Waste": E.waste_co2e_t_yr,
    "Livestock Enteric": E.livestock_co2e_t_yr,
}

# Village parameter tables keyed one-to-one on village_id.
VILLAGE_RECORD_MODELS = [
    Demographics, LandUse, WaterResources, EnergyConsumption, WasteManagement, TransportActivity, LivestockPopulation,
]


def _joined(*columns):
    query = select(*columns).select_from(Village)
    for model in [*VILLAGE_RECORD_MODELS, VillageEmissions]:
        query = query.outerjoin(model, model.village_id == Village.id)
    return query


class Village_crud(CrudBase):

    def __init__(self, db: AsyncSession, Model=Village):
        super().__init__(db, Model)

    async def get_records(self, block_name: str | None = None) -> list[dict]:
        query = _joined(*LIST_COLUMNS)
        if block_name and block_name != "All Blocks":
            query = query.where(Village.block_name == block_name)
        result = await self.db.execute(query.order_by(Village.village_name))
        return [dict(r) for r in result.mappings()]

    async def get_details(self, village_code: str) -> dict | None:
        query = _joined(*DETAIL_COLUMNS).where(Village.village_code == village_code)
        row = (await self.db.execute(query)).mappings().first()
        return dict(row) if row else None

    async def get_blocks(self) -> list[str]:
        result = await self.db.execute(select(Village.block_name).distinct().order_by(Village.block_name))
        return list(result.scalars())

    async def get_activity_data(self) -> list[dict]:
        result = await self.db.execute(_joined(*ACTIVITY_COLUMNS))
        return [dict(r) for r in result.mappings()]

    async def get_district_totals(self) -> dict:
        query = _joined(
            func.count(Village.id).label("total_villages"),
            func.coalesce(func.sum(Demographics.total_residents), 0).label("total_population"),
            func.coalesce(func.sum(LandUse.total_area_ha), 0).label("total_area_ha"),
            func.coalesce(func.sum(E.total_co2e_t_yr), 0).label("total_co2e_t_yr"),
            func.coalesce(func.avg(E.per_capita_co2e_kg_yr), 0).label("mean_per_capita_co2e_kg_yr"),
        )
        return dict((await self.db.execute(query)).mappings().one())

    async def get_block_emissions(self) -> list[dict]:
        total = func.coalesce(func.sum(E.total_co2e_t_yr), 0).label("total_co2e_t_yr")
        query = _joined(Village.block_name, total).group_by(Village.block_name).order_by(total.desc())
        return [dict(r) for r in (await self.db.execute(query)).mappings()]

    async def get_sector_emissions(self) -> list[dict]:
        query = select(*[func.coalesce(func.sum(col), 0).label(name) for name, col in SECTOR_COLUMNS.items()])
        sums = (await self.db.execute(query)).mappings().one()
        return [{"sector": name, "co2e_t_yr": float(sums[name])} for name in SECTOR_COLUMNS]

    async def upsert_village(self, data: dict) -> tuple[int, bool]:
        """Inserts or updates a village by census code; returns (village id, was inserted)."""
        stmt = insert(Village).values(**data)
        stmt = stmt.on_conflict_do_update(
            index_elements=["village_code"],
            set_={**{c: stmt.excluded[c] for c in data if c != "village_code"}, "modified_at": func.now()},
        ).returning(Village.id, literal_column("(xmax = 0)"))
        village_id, inserted = (await self.db.execute(stmt)).one()
        return village_id, inserted


class Village_record_crud(CrudBase):
    """Upserts rows of one village parameter table (demographics, land use, ...)."""

    def __init__(self, db: AsyncSession, Model):
        super().__init__(db, Model)

    async def upsert(self, rows: list[dict]):
        await self.upsert_many(rows, conflict_col="village_id")
