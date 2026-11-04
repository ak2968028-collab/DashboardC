import re
from datetime import datetime

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.crud.blog.async_crud import Blog_crud
from app.database.models import BlogPost, User

CATEGORIES = ("Update", "Research", "Event", "Field report", "Policy")
COVER_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_COVER_MB = 5


def _slugify(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:70] or "post"


def _record(row: dict) -> dict:
    return {**row, "has_cover": bool(row.get("cover_filename"))}


async def _read_cover(cover: UploadFile | None) -> tuple[str, str, bytes] | None:
    if not cover or not cover.filename:
        return None
    if cover.content_type not in COVER_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cover must be a JPEG, PNG, WebP or GIF image")
    data = await cover.read()
    if len(data) > MAX_COVER_MB * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=f"Cover image is larger than {MAX_COVER_MB} MB")
    return cover.filename, cover.content_type, data


class blog_svc:

    async def get_posts(db: AsyncSession, published_only: bool = True, limit: int | None = None):
        return [_record(r) for r in await Blog_crud(db).get_records(published_only, limit)]

    async def get_post(db: AsyncSession, slug: str, include_drafts: bool = False):
        post = await Blog_crud(db).get_details(slug)
        if not post or (not post["published"] and not include_drafts):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
        return _record(post)

    async def get_cover(db: AsyncSession, slug: str) -> BlogPost:
        post = await Blog_crud(db).get_by_slug(slug)
        if not post or not post.published or not post.cover_filename:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No cover image")
        await db.refresh(post, ["cover_data"])
        return post

    async def save_post(db: AsyncSession, admin: User, fields: dict, cover: UploadFile | None,
                        remove_cover: bool = False, post_id: int | None = None):
        crud = Blog_crud(db)
        if fields["category"] not in CATEGORIES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Category must be one of {', '.join(CATEGORIES)}")
        post = await crud.get_post(post_id) if post_id else BlogPost(author_id=admin.id, slug="")
        if post is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
        if not post_id:
            base = _slugify(fields["title"])
            slug, n = base, 2
            while await crud.slug_taken(slug):
                slug, n = f"{base}-{n}", n + 1
            post.slug = slug
        for key in ("title", "excerpt", "body", "category"):
            setattr(post, key, fields[key])
        if fields["published"] and not post.published:
            post.published_at = datetime.now()
        post.published = fields["published"]
        if remove_cover:
            post.cover_filename = post.cover_type = post.cover_data = None
        new_cover = await _read_cover(cover)
        if new_cover:
            post.cover_filename, post.cover_type, post.cover_data = new_cover
        db.add(post)
        await db.flush()
        return await blog_svc.get_post(db, post.slug, include_drafts=True)

    async def delete_post(db: AsyncSession, post_id: int):
        post = await Blog_crud(db).get_post(post_id)
        if not post:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
        await db.delete(post)
