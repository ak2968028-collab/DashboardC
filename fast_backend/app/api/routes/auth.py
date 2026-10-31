from fastapi import APIRouter, status

from app.api.schema.auth_schema import Login_request, Login_response, Password_change, User_record
from app.api.service.auth_svc.dependencies import current_user
from app.api.service.auth_svc.user_svc import user_svc
from app.database.config.dependency import db_read, db_write

router = APIRouter()


@router.post("/login", response_model=Login_response)
async def login(db: db_read, body: Login_request):
    """Admin / supervisor login; send the token back as `Authorization: Bearer <token>`."""
    return await user_svc.login(db, body.username, body.password)


@router.get("/me", response_model=User_record)
async def me(db: db_read, user: current_user):
    return await user_svc.get_user(db, user.id)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(db: db_write, user: current_user, body: Password_change):
    await user_svc.change_password(db, user, body.current_password, body.new_password)
