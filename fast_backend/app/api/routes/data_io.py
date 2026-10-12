from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import Response

from app.api.schema.emission_schema import Import_report
from app.api.service.carbon_svc.carbon import recompute_and_save_all_emissions
from app.api.service.import_svc.excel_import import import_village_excel
from app.api.service.village_svc import village_svc
from app.database.config.dependency import db_read, db_write

router = APIRouter()


@router.post("/import/excel", response_model=Import_report)
async def import_excel(db: db_write, file: UploadFile = File(...)):
    """Imports a survey Excel file into the database, then recomputes emissions."""
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please upload an .xlsx file")
    try:
        report = await import_village_excel(db, await file.read())
    except (ValueError, KeyError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Error during import: {e}")
    report["villages_recalculated"] = await recompute_and_save_all_emissions(db)
    return report


@router.get("/export/excel")
async def export_excel(db: db_read):
    return Response(
        await village_svc.export_excel(db),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="Varanasi_Village_Environmental_Database.xlsx"'},
    )
