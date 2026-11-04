import io

import pandas as pd
from fastapi import HTTPException, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.service.carbon_svc.carbon import get_emission_factors
from app.api.service.emission_svc import emission_svc
from app.api.service.report_svc.reporting import ADVANCED, BASIC, export_village_csv, generate_village_pdf
from app.api.service.submission_svc.submission import check_warnings
from app.database.crud.report.async_crud import Report_crud
from app.database.crud.user.async_crud import Submission_crud
from app.database.crud.village.async_crud import Village_crud
from app.conf.logging.applog import logger
from app.database.models.user import STATUS_APPROVED


def safe_filename(name) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in str(name))


def _lab_context(v) -> dict:
    """Carbon Lab data for the advanced report; each part is optional (missing parcels, GeoServer down, …)."""
    from app.api.service.geoserver_svc.emission_rasters import village_grid
    from app.api.service.scene_svc import build_scene

    out = {"scene": None, "grid": None}
    code = v["village_code"]
    try:
        if code.isdigit():
            out["scene"] = build_scene(code, int(v.get("total_households") or 0), float(v.get("builtup_area_ha") or 0))
    except Exception:
        logger.exception("Advanced report: 3D village layout unavailable for %s", code)
    try:
        out["grid"] = village_grid(code)
    except Exception as e:
        logger.warning("Advanced report: emission rasters unavailable for %s (%s)", code, e)
    return out


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

    async def village_pdf(db: AsyncSession, village_code: str, level: str = BASIC) -> tuple[bytes, str]:
        """Basic (public) or advanced (logged-in Pradhan / admin) village report."""
        v = await village_svc.get_village(db, village_code)
        report = Report_crud(db)
        context = {
            "layers": await report.get_map_layers(village_code),
            "bench": await report.get_benchmarks(village_code, v["block_name"]),
        }
        if level == ADVANCED:
            approved = await Submission_crud(db).get_records(status=STATUS_APPROVED, village_code=village_code)
            context |= {
                "factors": await get_emission_factors(db),
                "factor_table": await emission_svc.get_factor_table(db),
                "provenance": approved[0] if approved else None,
                "warnings": check_warnings(v),
                "villages": await Village_crud(db).get_records(),
                **await run_in_threadpool(_lab_context, v),
            }
        kind = "Advanced" if level == ADVANCED else "Basic"
        filename = f"{kind}_Village_Report_{safe_filename(v['village_name'])}_{v['village_code']}.pdf"
        return await run_in_threadpool(generate_village_pdf, v, context, level), filename

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
