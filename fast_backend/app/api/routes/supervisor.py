from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response

from app.api.schema.auth_schema import User_record
from app.api.schema.submission_schema import Submission_record, Submission_values, Supervisor_village
from app.api.service.auth_svc.dependencies import supervisor_user
from app.api.service.auth_svc.user_svc import user_svc
from app.api.service.submission_svc.submission import current_values, submission_svc
from app.api.service.village_svc import safe_filename
from app.database.config.dependency import db_read, db_write
from app.database.crud.location.async_crud import Location_crud
from app.database.crud.user.async_crud import Submission_crud

router = APIRouter()


@router.get("/village", response_model=Supervisor_village)
async def get_my_village(db: db_read, user: supervisor_user):
    """The supervisor's village and its values on the dashboard now."""
    if not user.village_code:
        return {"village": None, "current": None}
    return {"village": await Location_crud(db).get_village(user.village_code),
            "current": await current_values(db, user.village_code)}


@router.put("/village", response_model=User_record)
async def select_village(db: db_write, user: supervisor_user, village_code: str = Form(...),
                         certificate: UploadFile = File(..., description="Pradhan certificate: PDF, JPG or PNG, max 5 MB")):
    """Claim the supervisor's village with a Pradhan certificate; data entry opens once the admin verifies it."""
    return await user_svc.select_village(db, user, village_code.strip(), certificate.filename, await certificate.read())


@router.get("/template.xlsx")
async def get_template(db: db_read, user: supervisor_user):
    """Excel template with only the supervisor's own village row and the survey columns."""
    content = await submission_svc.template(db, user)
    return Response(content, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="Survey_Template_{safe_filename(user.village_code)}.xlsx"'})


@router.get("/submissions", response_model=list[Submission_record])
async def get_my_submissions(db: db_read, user: supervisor_user):
    if not user.village_code:
        return []
    return await Submission_crud(db).get_records(village_code=user.village_code)


@router.post("/submissions", response_model=Submission_record, status_code=status.HTTP_201_CREATED)
async def submit_form(db: db_write, user: supervisor_user, body: Submission_values):
    """Sends form values for admin approval (replaces the values of a submission still pending)."""
    submission_id = await submission_svc.submit(db, user, body.values, "form")
    return await submission_svc.get_submission(db, submission_id)


@router.post("/submissions/excel", response_model=Submission_record, status_code=status.HTTP_201_CREATED)
async def submit_excel(db: db_write, user: supervisor_user, file: UploadFile = File(...)):
    """Sends the filled-in Excel template for admin approval."""
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please upload an .xlsx file")
    values = await submission_svc.parse_excel(user, await file.read())
    submission_id = await submission_svc.submit(db, user, values, "excel")
    return await submission_svc.get_submission(db, submission_id)


@router.delete("/submissions/{submission_id}", status_code=status.HTTP_204_NO_CONTENT)
async def withdraw_submission(db: db_write, user: supervisor_user, submission_id: int):
    """Withdraws a submission that is still pending."""
    await submission_svc.withdraw(db, user, submission_id)
