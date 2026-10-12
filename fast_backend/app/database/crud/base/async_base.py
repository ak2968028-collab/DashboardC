from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession


class CrudBase:
    def __init__(self, db: AsyncSession, Model=None):
        self.db = db
        self.Model = Model

    async def get_all(self):
        result = await self.db.execute(select(self.Model).order_by(self.Model.id))
        return result.scalars().all()

    async def count(self) -> int:
        return await self.db.scalar(select(func.count()).select_from(self.Model))

    async def upsert_many(self, rows: list[dict], conflict_col: str):
        """INSERT ... ON CONFLICT (conflict_col) DO UPDATE for a batch of rows."""
        if not rows:
            return
        stmt = insert(self.Model)
        updates = {c: stmt.excluded[c] for c in rows[0] if c not in (conflict_col, "id")}
        stmt = stmt.on_conflict_do_update(index_elements=[conflict_col], set_={**updates, "modified_at": func.now()})
        await self.db.execute(stmt, rows)
