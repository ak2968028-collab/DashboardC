from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.crud.base.async_base import CrudBase
from app.database.models import BlogPost, User

POST_COLUMNS = [
    BlogPost.id, BlogPost.slug, BlogPost.title, BlogPost.excerpt, BlogPost.category, BlogPost.published,
    BlogPost.published_at, BlogPost.created_at, BlogPost.modified_at, BlogPost.cover_filename,
    User.username.label("author"), User.full_name.label("author_name"),
]


class Blog_crud(CrudBase):

    def __init__(self, db: AsyncSession, Model=BlogPost):
        super().__init__(db, Model)

    def _query(self, *extra):
        return select(*POST_COLUMNS, *extra).outerjoin(User, User.id == BlogPost.author_id)

    async def get_records(self, published_only: bool = True, limit: int | None = None) -> list[dict]:
        query = self._query()
        if published_only:
            query = query.where(BlogPost.published.is_(True))
        query = query.order_by(BlogPost.published_at.desc().nulls_last(), BlogPost.created_at.desc())
        if limit:
            query = query.limit(limit)
        return [dict(r) for r in (await self.db.execute(query)).mappings()]

    async def get_details(self, slug: str) -> dict | None:
        row = (await self.db.execute(self._query(BlogPost.body).where(BlogPost.slug == slug))).mappings().first()
        return dict(row) if row else None

    async def get_post(self, post_id: int) -> BlogPost | None:
        return await self.db.get(BlogPost, post_id)

    async def get_by_slug(self, slug: str) -> BlogPost | None:
        return await self.db.scalar(select(BlogPost).where(BlogPost.slug == slug))

    async def slug_taken(self, slug: str, exclude_id: int | None = None) -> bool:
        query = select(BlogPost.id).where(BlogPost.slug == slug)
        if exclude_id:
            query = query.where(BlogPost.id != exclude_id)
        return (await self.db.scalar(query)) is not None
