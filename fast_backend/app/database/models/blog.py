# Blog posts written by admins and shown on the dashboard home page and /blog.
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, LargeBinary, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.models.base import Base


class BlogPost(Base):
    __tablename__ = "blog_posts"

    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    excerpt: Mapped[Optional[str]] = mapped_column(Text)
    # Plain text with light markdown: "## " headings, "- " bullets, blank lines between paragraphs.
    body: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False, server_default=text("'Update'"))
    published: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    author_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # Cover image bytes kept in the database, like the Pradhan certificates.
    cover_filename: Mapped[Optional[str]] = mapped_column(String)
    cover_type: Mapped[Optional[str]] = mapped_column(String)
    cover_data: Mapped[Optional[bytes]] = mapped_column(LargeBinary, deferred=True)
