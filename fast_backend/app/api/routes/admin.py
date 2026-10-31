from fastapi import APIRouter, BackgroundTasks, Query, Response, status

from app.api.schema.auth_schema import (
    User_create, User_record, User_update, Verification_reject, Verification_review,
)
from app.api.schema.submission_schema import (
    Approve_response, Reject_request, Review_request, Submission_details, Submission_record,
)
from app.api.service.auth_svc.dependencies import admin_user
from app.api.service.auth_svc.user_csv import export_users_csv
from app.api.service.auth_svc.user_svc import user_svc
from app.api.service.submission_svc.submission import submission_svc
from app.api.service.village_svc import safe_filename
from app.database.config.dependency import db_read, db_write
from app.database.crud.user.async_crud import Submission_crud

router = APIRouter()


@router.get("/users", response_model=list[User_record])
async def get_users(db: db_read, _: admin_user):
    return await user_svc.get_users(db)


@router.post("/users", response_model=User_record, status_code=status.HTTP_201_CREATED)
async def create_user(db: db_write, admin: admin_user, body: User_create, tasks: BackgroundTasks):
    tasks.add_task(export_users_csv)
    return await user_svc.create_user(db, admin, body.model_dump())


@router.patch("/users/{user_id}", response_model=User_record)
async def update_user(db: db_write, admin: admin_user, user_id: int, body: User_update, tasks: BackgroundTasks):
    tasks.add_task(export_users_csv)
    return await user_svc.update_user(db, admin, user_id, body.model_dump(exclude_unset=True))


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(db: db_write, admin: admin_user, user_id: int, tasks: BackgroundTasks):
    tasks.add_task(export_users_csv, {await user_svc.delete_user(db, admin, user_id)})


@router.get("/verifications", response_model=list[User_record])
async def get_verifications(db: db_read, _: admin_user,
                            status: str | None = Query("pending", description="pending | verified | rejected | unverified")):
    """Supervisors by verification state (default: waiting for the admin to check their certificate)."""
    return await user_svc.get_users_by_verification(db, status)


@router.get("/users/{user_id}/certificate")
async def get_certificate(db: db_read, _: admin_user, user_id: int):
    """The supervisor's uploaded Pradhan certificate (shown inline in the browser)."""
    certificate = await user_svc.get_certificate(db, user_id)
    return Response(certificate.data, media_type=certificate.content_type,
                    headers={"Content-Disposition": f'inline; filename="{safe_filename(certificate.filename)}"'})


@router.post("/users/{user_id}/verify", response_model=User_record)
async def verify_supervisor(db: db_write, admin: admin_user, user_id: int, body: Verification_review,
                            tasks: BackgroundTasks):
    """Confirms the supervisor is the Pradhan of the village they chose; unlocks data entry."""
    tasks.add_task(export_users_csv)
    return await user_svc.verify(db, admin, user_id, body.comment)


@router.post("/users/{user_id}/reject-verification", response_model=User_record)
async def reject_supervisor(db: db_write, admin: admin_user, user_id: int, body: Verification_reject,
                            tasks: BackgroundTasks):
    """Rejects the village claim with a reason; the village is freed and the supervisor can try again."""
    tasks.add_task(export_users_csv)
    return await user_svc.reject_verification(db, admin, user_id, body.comment.strip())


@router.get("/submissions", response_model=list[Submission_record])
async def get_submissions(db: db_read, _: admin_user,
                          status: str | None = Query(None, description="pending | approved | rejected")):
    return await Submission_crud(db).get_records(status=status)


@router.get("/submissions/{submission_id}", response_model=Submission_details)
async def get_submission(db: db_read, _: admin_user, submission_id: int):
    """Submission with the village's current dashboard values, to compare before approving."""
    return await submission_svc.get_details(db, submission_id)


@router.post("/submissions/{submission_id}/approve", response_model=Approve_response)
async def approve_submission(db: db_write, admin: admin_user, submission_id: int, body: Review_request):
    """Writes the submission into the dashboard tables and recomputes emissions."""
    return {"villages_recalculated": await submission_svc.approve(db, admin, submission_id, body.comment)}


@router.post("/submissions/{submission_id}/reject", response_model=Submission_record)
async def reject_submission(db: db_write, admin: admin_user, submission_id: int, body: Reject_request):
    """Rejects with a comment the supervisor can see."""
    await submission_svc.reject(db, admin, submission_id, body.comment.strip())
    await db.flush()
    return await submission_svc.get_submission(db, submission_id)
