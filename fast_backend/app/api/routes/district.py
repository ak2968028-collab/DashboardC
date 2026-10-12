from fastapi import APIRouter

from app.api.schema.district_schema import District_summary
from app.api.service.village_svc import village_svc
from app.database.config.dependency import db_read

router = APIRouter()


@router.get("/blocks", response_model=list[str])
async def get_blocks(db: db_read):
    return await village_svc.get_blocks(db)


@router.get("/summary", response_model=District_summary)
async def get_summary(db: db_read):
    """District KPIs, block-wise emissions and sectoral breakdown."""
    return await village_svc.get_summary(db)
