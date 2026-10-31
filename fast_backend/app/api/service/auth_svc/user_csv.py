# ====================================================================
# app/api/service/auth_svc/user_csv.py
# Keeps media/user/users.csv in step with the users table, so accounts made or changed on the
# website come back after the database is rebuilt (docker compose down -v + media/run_all.py).
# ====================================================================
import csv
import fcntl
import os
import tempfile

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select

from app.api.service.auth_svc.security import verify_password
from app.conf.logging.applog import logger
from app.conf.settings import settings
from app.database.config.session import AsyncSessionLocal
from app.database.models import User
from app.database.models.user import VERIFY_DONE

COLUMNS = ["username", "password", "password_hash", "full_name", "role", "village_code", "is_active"]


def _csv_row(user: dict, old: dict | None) -> dict:
    # Keep a hand-written plain-text password while it is still the real one; otherwise store only the hash.
    plain = (old or {}).get("password") or ""
    keep_plain = bool(plain) and verify_password(plain, user["password_hash"])
    return {
        "username": user["username"],
        "password": plain if keep_plain else "",
        "password_hash": "" if keep_plain else user["password_hash"],
        "full_name": user["full_name"] or "",
        "role": user["role"],
        # Only a verified village is restored; pending / rejected claims need a new certificate.
        "village_code": user["village_code"] if user["verification_status"] == VERIFY_DONE and user["village_code"] else "",
        "is_active": "true" if user["is_active"] else "false",
    }


def _write(users: list[dict], removed: set[str]):
    path = settings.USERS_CSV_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path.parent / ".users.csv.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        old_rows = []
        if path.exists():
            with open(path, newline="", encoding="utf-8") as f:
                old_rows = [{k.strip(): (v or "").strip() for k, v in r.items() if k} for r in csv.DictReader(f)]
        in_db = {u["username"]: u for u in users}

        # Existing order first; rows not loaded into the database yet are kept, deleted accounts dropped.
        rows, seen = [], set()
        for old in old_rows:
            name = old.get("username", "")
            if name in seen or name in removed:
                continue
            seen.add(name)
            rows.append(_csv_row(in_db[name], old) if name in in_db else {c: old.get(c, "") for c in COLUMNS})
        rows += [_csv_row(u, None) for u in users if u["username"] not in seen]

        fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".users.", suffix=".csv")
        with os.fdopen(fd, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=COLUMNS)
            writer.writeheader()
            writer.writerows(rows)
        os.chmod(tmp, 0o664)
        os.replace(tmp, path)


async def export_users_csv(removed: set[str] = frozenset()):
    """Rewrites users.csv from the database (run after the change is committed). Never raises."""
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(
                User.username, User.password_hash, User.full_name, User.role, User.village_code,
                User.verification_status, User.is_active,
            ).order_by(User.id))
            users = [dict(r) for r in result.mappings()]
        await run_in_threadpool(_write, users, set(removed))
    except Exception:
        logger.exception("Could not update %s", settings.USERS_CSV_PATH)
