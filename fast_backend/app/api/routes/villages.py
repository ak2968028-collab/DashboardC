from fastapi import APIRouter, Query
from fastapi.responses import Response

from app.api.schema.village_schema import Village_details, Village_record
from app.api.service.village_svc import village_svc
from app.database.config.dependency import db_read

router = APIRouter()


@router.get("", response_model=list[Village_record])
async def get_villages(db: db_read, block: str | None = Query(None, description="Filter by block name")):
    """All villages with activity data and calculated emissions."""
    return await village_svc.get_villages(db, block)


@router.get("/{village_code}", response_model=Village_details)
async def get_village(db: db_read, village_code: str):
    """Complete record of all 12 parameters and emissions for one village."""
    return await village_svc.get_village(db, village_code)


@router.get("/{village_code}/report.pdf")
async def get_village_report(db: db_read, village_code: str):
    pdf, filename = await village_svc.village_pdf(db, village_code)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/{village_code}/export.csv")
async def get_village_csv(db: db_read, village_code: str):
    csv, filename = await village_svc.village_csv(db, village_code)
    return Response(csv, media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})
