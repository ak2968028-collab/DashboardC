from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.crud.location.async_crud import Location_crud


class location_svc:

    async def get_states(db: AsyncSession):
        return await Location_crud(db).get_states()

    async def get_districts(db: AsyncSession, state_code: int):
        return await Location_crud(db).get_districts(state_code)

    async def get_subdistricts(db: AsyncSession, district_code: int):
        return await Location_crud(db).get_subdistricts(district_code)

    async def get_villages(db: AsyncSession, subdistrict_code: int | None, search: str | None):
        if subdistrict_code is None and not search:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="Pass subdistrict_code or search (village name)")
        return await Location_crud(db).get_villages(subdistrict_code, search)

    async def get_village(db: AsyncSession, village_code: str):
        village = await Location_crud(db).get_village(village_code)
        if not village:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Census village {village_code} not found")
        return village
