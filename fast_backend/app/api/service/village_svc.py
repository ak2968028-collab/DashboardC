import io

import pandas as pd
from fastapi import HTTPException, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.service.report_svc.reporting import export_village_csv, generate_village_pdf
from app.database.crud.village.async_crud import Village_crud


def safe_filename(name) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in str(name))


class village_svc:

    async def get_villages(db: AsyncSession, block: str | None = None):
        return await Village_crud(db).get_records(block)

    async def get_village(db: AsyncSession, village_code: str):
        village = await Village_crud(db).get_details(village_code)
        if not village:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Village {village_code} not found")
        return village

    async def get_blocks(db: AsyncSession):
        return await Village_crud(db).get_blocks()

    async def get_summary(db: AsyncSession):
        crud = Village_crud(db)
        return {
            **await crud.get_district_totals(),
            'block_emissions': await crud.get_block_emissions(),
            'sector_emissions': await crud.get_sector_emissions(),
        }

    async def village_pdf(db: AsyncSession, village_code: str) -> tuple[bytes, str]:
        v = await village_svc.get_village(db, village_code)
        filename = f"Varanasi_Carbon_Report_{safe_filename(v['village_name'])}_{v['village_code']}.pdf"
        return await run_in_threadpool(generate_village_pdf, v), filename

    async def village_csv(db: AsyncSession, village_code: str) -> tuple[str, str]:
        v = await village_svc.get_village(db, village_code)
        return export_village_csv(v), f"{safe_filename(v['village_name'])}_{v['village_code']}_data.csv"

    async def export_excel(db: AsyncSession) -> bytes:
        df = pd.DataFrame(await Village_crud(db).get_records())

        def to_xlsx():
            buffer = io.BytesIO()
            with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
                df.to_excel(writer, index=False, sheet_name='Varanasi_Villages')
            return buffer.getvalue()

        return await run_in_threadpool(to_xlsx)
