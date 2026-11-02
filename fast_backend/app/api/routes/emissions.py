from fastapi import APIRouter, BackgroundTasks

from app.api.schema.emission_schema import Emission_factor, Recompute_response
from app.api.service.auth_svc.dependencies import admin_user
from app.api.service.carbon_svc.carbon import recompute_and_save_all_emissions
from app.api.service.emission_svc import emission_svc
from app.api.service.geoserver_svc import emission_rasters
from app.conf.logging.applog import logger
from app.conf.settings import settings
from app.database.config.dependency import db_read, db_write
from app.database.config.session import AsyncSessionLocal

router = APIRouter()


@router.get("/emission-factors", response_model=list[Emission_factor])
async def get_emission_factors(db: db_read):
    return await emission_svc.get_factor_table(db)


@router.post("/emissions/recompute", response_model=Recompute_response)
async def recompute_emissions(db: db_write, _: admin_user, background: BackgroundTasks):
    """Recalculates emissions for every village using the active factors, then rebuilds the emission rasters."""
    count = await recompute_and_save_all_emissions(db)
    if settings.GEOSERVER_URL:
        background.add_task(_refresh_emission_rasters)
    return {"villages_recalculated": count}


async def _refresh_emission_rasters():
    try:
        async with AsyncSessionLocal() as db:
            report = await emission_rasters.regenerate(db)
        logger.info("Emission rasters rebuilt: %d layers, %.1f t placed", len(report["layers"]), report["placed_t"])
    except Exception:
        logger.exception("Emission rasters: rebuild after recompute failed")
