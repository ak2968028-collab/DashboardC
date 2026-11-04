from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class Blog_record(BaseModel):
    """Blog post as listed on the home page and /blog (no body)."""
    id: int
    slug: str
    title: str
    excerpt: Optional[str] = None
    category: str
    published: bool
    published_at: Optional[datetime] = None
    created_at: datetime
    modified_at: datetime
    has_cover: bool
    cover_filename: Optional[str] = None
    author: Optional[str] = None
    author_name: Optional[str] = None


class Blog_details(Blog_record):
    body: str
