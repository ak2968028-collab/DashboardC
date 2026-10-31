# Creates the first admin account (or resets an existing user's password and makes them admin).
# Usage (from the project root):
#   docker compose exec fast_backend python -m script.create_admin <username> [--name "Full Name"]
# The password is asked for interactively, or read from ADMIN_PASSWORD.
import argparse
import asyncio
import getpass
import os

from app.api.service.auth_svc.user_svc import user_svc
from app.database.config.dependency import write_session_ctx


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("username")
    parser.add_argument("--name", default=None, help="full name")
    args = parser.parse_args()
    password = os.getenv("ADMIN_PASSWORD") or getpass.getpass("Password (min 6 characters): ")
    if len(password) < 6:
        raise SystemExit("Password must be at least 6 characters")
    async with write_session_ctx() as db:
        created = await user_svc.ensure_admin(db, args.username, password, args.name)
    print(f"Admin '{args.username}' {'created' if created else 'updated'}.")


if __name__ == "__main__":
    asyncio.run(main())
