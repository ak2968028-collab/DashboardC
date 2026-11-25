# Research papers shown on the References page: metadata, the in-app markdown, and their documents (paper PDF,
# summary PPT, simplified report, key highlights). Loaded from media/Research_paper by
# script/database/references/research_papers.py; the API serves them from here.
from typing import Optional

from sqlalchemy import ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.models.base import Base


class ResearchPaper(Base):
    __tablename__ = "research_papers"

    folder: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    title: Mapped[str] = mapped_column(String, nullable=False)
    authors: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    year: Mapped[str] = mapped_column(String, nullable=False, server_default="")
    journal: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    doi: Mapped[Optional[str]] = mapped_column(String)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    metrics: Mapped[list] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    points: Mapped[list] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    highlights_md: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    report_md: Mapped[str] = mapped_column(Text, nullable=False, server_default="")

    files: Mapped[list["ResearchPaperFile"]] = relationship(back_populates="paper", cascade="all, delete-orphan")


class ResearchPaperFile(Base):
    """One document of a paper. file_type: paper | ppt (Summary.pptx) | ppt_pdf (Summary.pdf) | report | highlights."""
    __tablename__ = "research_paper_files"
    __table_args__ = (UniqueConstraint("paper_id", "file_type"),)

    paper_id: Mapped[int] = mapped_column(ForeignKey("research_papers.id", ondelete="CASCADE"), nullable=False, index=True)
    file_type: Mapped[str] = mapped_column(String, nullable=False)
    filename: Mapped[str] = mapped_column(String, nullable=False)
    content_type: Mapped[str] = mapped_column(String, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False, deferred=True)

    paper: Mapped["ResearchPaper"] = relationship(back_populates="files")
