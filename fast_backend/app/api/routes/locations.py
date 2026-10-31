from fastapi import APIRouter, Query

from app.api.schema.location_schema import (
    Census_village, Census_village_details, District_record, State_record, Subdistrict_record,
)
from app.api.service.location_svc import location_svc
from app.database.config.dependency import db_read

router = APIRouter()


@router.get("/states", response_model=list[State_record])
async def get_states(db: db_read):
    return await location_svc.get_states(db)


@router.get("/districts", response_model=list[District_record])
async def get_districts(db: db_read, state_code: int = Query(..., description="Census state code, e.g. 9 (Uttar Pradesh)")):
    return await location_svc.get_districts(db, state_code)


@router.get("/subdistricts", response_model=list[Subdistrict_record])
async def get_subdistricts(db: db_read, district_code: int = Query(..., description="Census district code, e.g. 187 (Varanasi)")):
    return await location_svc.get_subdistricts(db, district_code)


@router.get("/villages", response_model=list[Census_village])
async def get_villages(
    db: db_read,
    subdistrict_code: int | None = Query(None, description="Census sub-district code, e.g. 995 (Pindra)"),
    search: str | None = Query(None, min_length=2, description="Village name contains (max 50 results without subdistrict_code)"),
):
    """Census villages of a sub-district, or a name search across India."""
    return await location_svc.get_villages(db, subdistrict_code, search)


@router.get("/villages/{village_code}", response_model=Census_village_details)
async def get_village(db: db_read, village_code: str):
    """One census village with its State > District > Sub-district path."""
    return await location_svc.get_village(db, village_code)
