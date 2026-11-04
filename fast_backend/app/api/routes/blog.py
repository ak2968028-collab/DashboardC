from fastapi import APIRouter, File, Form, Query, Response, UploadFile, status

from app.api.schema.blog_schema import Blog_details, Blog_record
from app.api.service.auth_svc.dependencies import admin_user
from app.api.service.blog_svc.blog import CATEGORIES, blog_svc
from app.database.config.dependency import db_read, db_write

router = APIRouter()


@router.get("", response_model=list[Blog_record])
async def get_posts(db: db_read, limit: int | None = Query(None, ge=1, le=50)):
    """Published posts, newest first."""
    return await blog_svc.get_posts(db, limit=limit)


@router.get("/categories", response_model=list[str])
async def get_categories():
    return list(CATEGORIES)


@router.get("/manage", response_model=list[Blog_record])
async def get_all_posts(db: db_read, _: admin_user):
    """Every post including drafts (admins)."""
    return await blog_svc.get_posts(db, published_only=False)


@router.get("/manage/{slug}", response_model=Blog_details)
async def get_any_post(db: db_read, _: admin_user, slug: str):
    return await blog_svc.get_post(db, slug, include_drafts=True)


@router.get("/{slug}", response_model=Blog_details)
async def get_post(db: db_read, slug: str):
    return await blog_svc.get_post(db, slug)


@router.get("/{slug}/cover")
async def get_cover(db: db_read, slug: str):
    post = await blog_svc.get_cover(db, slug)
    return Response(post.cover_data, media_type=post.cover_type, headers={"Cache-Control": "public, max-age=3600"})


def _fields(title: str, excerpt: str | None, body: str, category: str, published: bool) -> dict:
    return {"title": title.strip(), "excerpt": (excerpt or "").strip() or None, "body": body.strip(),
            "category": category, "published": published}


@router.post("", response_model=Blog_details, status_code=status.HTTP_201_CREATED)
async def create_post(
    db: db_write, admin: admin_user,
    title: str = Form(..., min_length=3, max_length=160), excerpt: str | None = Form(None, max_length=400),
    body: str = Form(..., min_length=1), category: str = Form("Update"), published: bool = Form(False),
    cover: UploadFile | None = File(None),
):
    """New post (admins). Drafts stay hidden until published."""
    return await blog_svc.save_post(db, admin, _fields(title, excerpt, body, category, published), cover)


@router.put("/{post_id}", response_model=Blog_details)
async def update_post(
    db: db_write, admin: admin_user, post_id: int,
    title: str = Form(..., min_length=3, max_length=160), excerpt: str | None = Form(None, max_length=400),
    body: str = Form(..., min_length=1), category: str = Form("Update"), published: bool = Form(False),
    cover: UploadFile | None = File(None), remove_cover: bool = Form(False),
):
    return await blog_svc.save_post(db, admin, _fields(title, excerpt, body, category, published), cover, remove_cover, post_id)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(db: db_write, _: admin_user, post_id: int):
    await blog_svc.delete_post(db, post_id)
