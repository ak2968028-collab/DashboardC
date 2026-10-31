from fastapi import APIRouter

from app.api.schema.emission_schema import Emission_factor, Recompute_response
from app.api.service.auth_svc.dependencies import admin_user
from app.api.service.carbon_svc.carbon import recompute_and_save_all_emissions
from app.api.service.emission_svc import emission_svc
from app.database.config.dependency import db_read, db_write

router = APIRouter()


@router.get("/emission-factors", response_model=list[Emission_factor])
async def get_emission_factors(db: db_read):
    return await emission_svc.get_factor_table(db)


@router.post("/emissions/recompute", response_model=Recompute_response)
async def recompute_emissions(db: db_write, _: admin_user):
    """Recalculates emissions for every village using the active factors."""
    return {"villages_recalculated": await recompute_and_save_all_emissions(db)}
