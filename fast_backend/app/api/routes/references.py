from urllib.parse import quote

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response

from app.api.service.reference_svc import reference_svc
from app.database.config.dependency import db_read

router = APIRouter()


@router.get("", response_model=list[dict])
async def list_references(db: db_read):
    """All research papers of the References page (from the database)."""
    return await reference_svc.list_papers(db)


@router.get("/{folder}/file/{file_type}")
async def get_reference_file(db: db_read, folder: str, file_type: str):
    """
    A paper's document, served from the database:
    - `paper`: original research paper PDF
    - `ppt`: summary presentation (.pptx, else .pdf)
    - `report`: simplified report (.pdf, else .docx)
    - `highlights`: key highlights (.pdf, else .docx)
    PDFs open in the browser; other files download.
    """
    doc = await reference_svc.get_file(db, folder, file_type)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Resource '{file_type}' for paper '{folder}' not found.")
    disposition = "inline" if doc.filename.lower().endswith(".pdf") else "attachment"
    return Response(content=doc.data, media_type=doc.content_type, headers={
        "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(doc.filename)}",
        "Cache-Control": "public, max-age=86400",
    })


async def _markdown(db, folder: str, kind: str, missing: str) -> dict:
    markdown = await reference_svc.get_markdown(db, folder, kind)
    if markdown is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paper not found")
    if not markdown:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=missing)
    return {"folder": folder, "markdown": markdown}


@router.get("/{folder}/highlights")
async def get_paper_highlights(db: db_read, folder: str):
    """Key highlights markdown for in-app reading."""
    return await _markdown(db, folder, "highlights", "Key highlights not available for this paper")


@router.get("/{folder}/report")
async def get_paper_report(db: db_read, folder: str):
    """Simplified report markdown for in-app reading."""
    return await _markdown(db, folder, "report", "Report not available for this paper")
