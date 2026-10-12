from sqlalchemy.ext.asyncio import AsyncSession

from app.database.crud.base.async_base import CrudBase
from app.database.models import EmissionFactor, VillageEmissions


class Emission_factor_crud(CrudBase):

    def __init__(self, db: AsyncSession, Model=EmissionFactor):
        super().__init__(db, Model)

    async def upsert(self, rows: list[dict]):
        await self.upsert_many(rows, conflict_col="id")


class Village_emissions_crud(CrudBase):

    def __init__(self, db: AsyncSession, Model=VillageEmissions):
        super().__init__(db, Model)

    async def upsert(self, rows: list[dict]):
        await self.upsert_many(rows, conflict_col="village_id")
