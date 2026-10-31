from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.api.service.auth_svc.security import decode_access_token
from app.database.config.dependency import db_read
from app.database.models import User
from app.database.models.user import ROLE_ADMIN, ROLE_SUPERVISOR

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(db: db_read, creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> User:
    user_id = decode_access_token(creds.credentials) if creds else None
    user = await db.get(User, user_id) if user_id else None
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please log in again",
                            headers={"WWW-Authenticate": "Bearer"})
    return user


def require_role(role: str):
    async def check(user: User = Depends(get_current_user)) -> User:
        if user.role != role:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Only a {role} can do this")
        return user
    return check


current_user = Annotated[User, Depends(get_current_user)]
admin_user = Annotated[User, Depends(require_role(ROLE_ADMIN))]
supervisor_user = Annotated[User, Depends(require_role(ROLE_SUPERVISOR))]
