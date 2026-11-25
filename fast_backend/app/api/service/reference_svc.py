"""Research papers of the References page, read from the database (research_papers / research_paper_files, loaded
from media/Research_paper by script/database/references/research_papers.py)."""
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import undefer

from app.database.models.reference import ResearchPaper, ResearchPaperFile

# API file type -> stored documents, in order of preference
FILE_TYPES = {
    "paper": ("paper",),
    "ppt": ("ppt", "ppt_pdf"),
    "report": ("report",),
    "highlights": ("highlights",),
}
# Response field -> stored document whose file name it reports (None when the paper has no such document)
FILE_FIELDS = {"paper_file": "paper", "ppt_file": "ppt", "ppt_pdf": "ppt_pdf", "report_file": "report",
               "highlights_file": "highlights"}


class ReferenceService:

    @staticmethod
    async def list_papers(db: AsyncSession) -> list[dict[str, Any]]:
        papers = (await db.execute(select(ResearchPaper).order_by(ResearchPaper.sort_order))).scalars().all()
        rows = (await db.execute(select(ResearchPaperFile.paper_id, ResearchPaperFile.file_type,
                                        ResearchPaperFile.filename))).all()
        names: dict[int, dict[str, str]] = {}
        for paper_id, file_type, filename in rows:
            names.setdefault(paper_id, {})[file_type] = filename
        return [{
            "id": p.folder, "folder": p.folder, "title": p.title, "authors": p.authors, "year": p.year,
            "journal": p.journal, "doi": p.doi or "", "description": p.description,
            **{field: names.get(p.id, {}).get(file_type) for field, file_type in FILE_FIELDS.items()},
            "metrics": p.metrics or [], "points": p.points or [],
            "highlights_md": p.highlights_md, "report_md": p.report_md,
        } for p in papers]

    @staticmethod
    async def get_file(db: AsyncSession, folder: str, file_type: str) -> ResearchPaperFile | None:
        """The document of a paper for an API file type (paper | ppt | report | highlights), with its bytes."""
        wanted = FILE_TYPES.get(file_type.lower())
        if not wanted:
            return None
        rows = (await db.execute(
            select(ResearchPaperFile).options(undefer(ResearchPaperFile.data))
            .join(ResearchPaper).where(ResearchPaper.folder == folder, ResearchPaperFile.file_type.in_(wanted))
        )).scalars().all()
        by_type = {r.file_type: r for r in rows}
        return next((by_type[t] for t in wanted if t in by_type), None)

    @staticmethod
    async def get_markdown(db: AsyncSession, folder: str, kind: str) -> str | None:
        """The paper's key highlights (kind='highlights') or simplified report (kind='report') as markdown; None for an
        unknown paper."""
        column = ResearchPaper.highlights_md if kind == "highlights" else ResearchPaper.report_md
        return (await db.execute(select(column).where(ResearchPaper.folder == folder))).scalar_one_or_none()


reference_svc = ReferenceService()
