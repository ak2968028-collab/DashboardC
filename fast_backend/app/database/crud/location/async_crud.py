from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.crud.base.async_base import CrudBase
from app.database.models import CensusVillage, District, State, Subdistrict, Village

SEARCH_LIMIT = 50

VILLAGE_COLUMNS = [
    CensusVillage.village_code, CensusVillage.village_name, CensusVillage.subdistrict_code,
    CensusVillage.population_2011,
    exists().where(Village.village_code == CensusVillage.village_code).label("on_dashboard"),
]

# Village with its full State > District > Sub-district path.
HIERARCHY_COLUMNS = VILLAGE_COLUMNS + [
    Subdistrict.subdistrict_name, District.district_code, District.district_name, State.state_code, State.state_name,
]


class Location_crud(CrudBase):

    def __init__(self, db: AsyncSession, Model=CensusVillage):
        super().__init__(db, Model)

    async def _rows(self, query) -> list[dict]:
        return [dict(r) for r in (await self.db.execute(query)).mappings()]

    async def get_states(self) -> list[dict]:
        return await self._rows(select(State.state_code, State.state_name).order_by(State.state_name))

    async def get_districts(self, state_code: int) -> list[dict]:
        query = (select(District.district_code, District.district_name, District.state_code)
                 .where(District.state_code == state_code).order_by(District.district_name))
        return await self._rows(query)

    async def get_subdistricts(self, district_code: int) -> list[dict]:
        query = (select(Subdistrict.subdistrict_code, Subdistrict.subdistrict_name, Subdistrict.district_code)
                 .where(Subdistrict.district_code == district_code).order_by(Subdistrict.subdistrict_name))
        return await self._rows(query)

    async def get_villages(self, subdistrict_code: int | None = None, search: str | None = None) -> list[dict]:
        query = select(*VILLAGE_COLUMNS).order_by(CensusVillage.village_name)
        if subdistrict_code is not None:
            query = query.where(CensusVillage.subdistrict_code == subdistrict_code)
        if search:
            query = query.where(CensusVillage.village_name.ilike(f"%{search}%"))
            if subdistrict_code is None:
                query = query.limit(SEARCH_LIMIT)
        return await self._rows(query)

    async def get_village(self, village_code: str) -> dict | None:
        query = (select(*HIERARCHY_COLUMNS)
                 .join(Subdistrict, Subdistrict.subdistrict_code == CensusVillage.subdistrict_code)
                 .join(District, District.district_code == Subdistrict.district_code)
                 .join(State, State.state_code == District.state_code)
                 .where(CensusVillage.village_code == village_code))
        row = (await self.db.execute(query)).mappings().first()
        return dict(row) if row else None
