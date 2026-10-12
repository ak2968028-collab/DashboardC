from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.config.session import AsyncSessionLocal


class PostgresDb:

    async def get_write_session(self):
        async with AsyncSessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def get_read_session(self):
        async with AsyncSessionLocal() as session:
            yield session

    @asynccontextmanager
    async def write_session_ctx(self):
        """Transactional session for scripts (seeding, GeoServer publishing)."""
        async with AsyncSessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise


_db = PostgresDb()

db_write = Annotated[AsyncSession, Depends(_db.get_write_session, use_cache=False)]
db_read = Annotated[AsyncSession, Depends(_db.get_read_session, use_cache=False)]
write_session_ctx = _db.write_session_ctx
