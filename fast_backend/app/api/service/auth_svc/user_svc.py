from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.service.auth_svc.security import create_access_token, hash_password, verify_password
from app.database.crud.location.async_crud import Location_crud
from app.database.crud.user.async_crud import Certificate_crud, User_crud
from app.database.models import User
from app.database.models.user import (
    ROLE_ADMIN, ROLE_SUPERVISOR, VERIFY_DONE, VERIFY_NONE, VERIFY_PENDING, VERIFY_REJECTED,
)

MAX_CERTIFICATE_BYTES = 5 * 1024 * 1024

# Accepted certificate formats, recognised by their first bytes (not the browser-sent type).
CERTIFICATE_TYPES = [
    (b"%PDF", "application/pdf"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
]


def _conflict(detail: str):
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


async def _flush(db: AsyncSession):
    """Flush, reporting a lost race on a unique username / village as a conflict."""
    try:
        await db.flush()
    except IntegrityError:
        raise _conflict("That username or village was just taken; refresh and try again")


def _set_verification(user: User, state: str, admin: User | None = None, comment: str | None = None):
    user.verification_status, user.verification_comment = state, comment
    user.verified_by = admin.id if admin else None
    user.verified_at = datetime.now() if admin else None


def _certificate_type(content: bytes) -> str:
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload your Pradhan certificate")
    if len(content) > MAX_CERTIFICATE_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Certificate file must be 5 MB or smaller")
    for magic, content_type in CERTIFICATE_TYPES:
        if content.startswith(magic):
            return content_type
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Certificate must be a PDF, JPG or PNG file")


class user_svc:

    async def login(db: AsyncSession, username: str, password: str) -> dict:
        user = await User_crud(db).get_by_username(username.strip())
        if not user or not verify_password(password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Wrong username or password")
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account is disabled; contact the admin")
        return {"access_token": create_access_token(user.id), "token_type": "bearer",
                "user": await user_svc.get_user(db, user.id)}

    async def get_user(db: AsyncSession, user_id: int) -> dict:
        rows = await User_crud(db).get_records(user_id)
        if not rows:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User {user_id} not found")
        return rows[0]

    async def get_users(db: AsyncSession) -> list[dict]:
        return await User_crud(db).get_records()

    async def _check_village(db: AsyncSession, village_code: str, user_id: int | None = None):
        if not await Location_crud(db).get_village(village_code):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Census village {village_code} not found")
        holder = await User_crud(db).get_by_village(village_code)
        if holder and holder.id != user_id:
            raise _conflict(f"Village {village_code} already has a supervisor ({holder.username})")

    async def create_user(db: AsyncSession, admin: User, data: dict) -> dict:
        if await User_crud(db).get_by_username(data["username"]):
            raise _conflict(f"Username '{data['username']}' is taken")
        village_code = data.get("village_code") if data["role"] == ROLE_SUPERVISOR else None
        if village_code:
            await user_svc._check_village(db, village_code)
        user = User(username=data["username"], password_hash=hash_password(data["password"]),
                    full_name=data.get("full_name"), role=data["role"], village_code=village_code)
        if data["role"] == ROLE_SUPERVISOR:
            # A village assigned by the admin needs no further verification.
            _set_verification(user, VERIFY_DONE if village_code else VERIFY_NONE, admin if village_code else None)
        db.add(user)
        await _flush(db)
        return await user_svc.get_user(db, user.id)

    async def update_user(db: AsyncSession, admin: User, user_id: int, data: dict) -> dict:
        user = await db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User {user_id} not found")
        if user.id == admin.id and data.get("is_active") is False:
            raise _conflict("You cannot disable your own account")
        if "village_code" in data:
            if data["village_code"] and user.role != ROLE_SUPERVISOR:
                raise _conflict("Only supervisors are linked to a village")
            if data["village_code"]:
                await user_svc._check_village(db, data["village_code"], user.id)
            user.village_code = data["village_code"] or None
            if user.role == ROLE_SUPERVISOR:
                _set_verification(user, VERIFY_DONE if user.village_code else VERIFY_NONE, admin if user.village_code else None)
        if data.get("password"):
            user.password_hash = hash_password(data["password"])
        for field in ("full_name", "is_active"):
            if field in data:
                setattr(user, field, data[field])
        await _flush(db)
        return await user_svc.get_user(db, user.id)

    async def delete_user(db: AsyncSession, admin: User, user_id: int):
        user = await db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User {user_id} not found")
        if user.id == admin.id:
            raise _conflict("You cannot delete your own account")
        await db.delete(user)

    async def select_village(db: AsyncSession, supervisor: User, village_code: str,
                             filename: str, certificate: bytes) -> dict:
        """A supervisor claims their village with a Pradhan certificate; the admin then verifies it."""
        user = await db.get(User, supervisor.id)
        if user.verification_status not in (VERIFY_NONE, VERIFY_REJECTED, None):
            raise _conflict("Your village is already chosen; ask the admin to change it")
        content_type = _certificate_type(certificate)
        await user_svc._check_village(db, village_code, user.id)
        user.village_code = village_code
        _set_verification(user, VERIFY_PENDING)
        await Certificate_crud(db).save(user.id, filename or "certificate", content_type, certificate)
        await _flush(db)
        return await user_svc.get_user(db, user.id)

    async def get_users_by_verification(db: AsyncSession, verification_status: str | None) -> list[dict]:
        return await User_crud(db).get_records(verification_status=verification_status)

    async def get_certificate(db: AsyncSession, user_id: int):
        certificate = await Certificate_crud(db).get(user_id)
        if not certificate:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No certificate uploaded")
        return certificate

    async def _pending_supervisor(db: AsyncSession, user_id: int) -> User:
        user = await db.get(User, user_id)
        if not user or user.role != ROLE_SUPERVISOR:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Supervisor {user_id} not found")
        if user.verification_status != VERIFY_PENDING:
            raise _conflict(f"{user.username} is not waiting for verification ({user.verification_status})")
        return user

    async def verify(db: AsyncSession, admin: User, user_id: int, comment: str | None) -> dict:
        user = await user_svc._pending_supervisor(db, user_id)
        _set_verification(user, VERIFY_DONE, admin, comment)
        await _flush(db)
        return await user_svc.get_user(db, user.id)

    async def reject_verification(db: AsyncSession, admin: User, user_id: int, comment: str) -> dict:
        """Frees the village; the supervisor can choose again and upload a new certificate."""
        user = await user_svc._pending_supervisor(db, user_id)
        user.village_code = None
        _set_verification(user, VERIFY_REJECTED, admin, comment)
        await _flush(db)
        return await user_svc.get_user(db, user.id)

    async def change_password(db: AsyncSession, current: User, old_password: str, new_password: str):
        user = await db.get(User, current.id)
        if not verify_password(old_password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is wrong")
        user.password_hash = hash_password(new_password)

    async def ensure_admin(db: AsyncSession, username: str, password: str, full_name: str | None = None) -> bool:
        """Creates the admin, or resets an existing user's password and makes them admin; True if created."""
        user = await User_crud(db).get_by_username(username)
        if user:
            user.password_hash, user.role, user.village_code, user.is_active = hash_password(password), ROLE_ADMIN, None, True
            user.verification_status = None
            return False
        db.add(User(username=username, password_hash=hash_password(password), full_name=full_name, role=ROLE_ADMIN))
        return True
