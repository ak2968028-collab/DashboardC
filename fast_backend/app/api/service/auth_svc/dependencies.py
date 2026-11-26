import fnmatch
import hmac
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import Depends, HTTPException, Request, Security, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer

from app.api.service.auth_svc.security import decode_access_token
from app.conf.settings import settings
from app.database.config.dependency import db_read
from app.database.models import User
from app.database.models.user import ROLE_ADMIN, ROLE_SUPERVISOR

_bearer = HTTPBearer(auto_error=False)
_website_key_header = APIKeyHeader(
    name="X-Website-Key",
    scheme_name="WebsiteGatewayKey",
    description="Website gateway key injected automatically by the dashboard web server. Direct external requests are blocked.",
    auto_error=False,
)


def _host_allowed(host: str) -> bool:
    clean = host.strip().lower()
    if not clean:
        return False
    bare = clean.rsplit(":", 1)[0] if ":" in clean else clean
    return any(
        fnmatch.fnmatch(clean, pattern.strip().lower())
        or fnmatch.fnmatch(bare, pattern.strip().lower())
        for pattern in settings.ALLOWED_WEBSITE_HOSTS
    )


async def require_website_access(
    request: Request,
    website_key: str | None = Security(_website_key_header),
) -> None:
    """Enforces that API requests come from the authorized dashboard website (not direct scraping or third-party servers)."""
    if not website_key or not hmac.compare_digest(website_key, settings.WEBSITE_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: API is accessible only through the official dashboard website.",
            headers={"WWW-Authenticate": "WebsiteGatewayKey"},
        )

    forwarded_host = (request.headers.get("x-website-host") or "").strip().lower()
    origin_host = urlsplit(request.headers.get("origin") or "").netloc.lower()
    referer_host = urlsplit(request.headers.get("referer") or "").netloc.lower()
    candidate = forwarded_host or origin_host or referer_host or (request.headers.get("host") or "").strip().lower()

    if not _host_allowed(candidate):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: API access is restricted to authorized website domains.",
        )


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
website_access = Annotated[None, Depends(require_website_access)]
