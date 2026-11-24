import mimetypes
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import FileResponse

from app.api.service.reference_svc import reference_svc

router = APIRouter()


@router.get("", response_model=list[dict])
async def list_references(refresh: bool = Query(False, description="Force re-scan of research folder")):
    """Dynamically scan and list all research papers available in Research_paper."""
    return reference_svc.scan_papers(force=refresh)


@router.get("/{folder}/file/{file_type}")
async def get_reference_file(folder: str, file_type: str):
    """
    Download or stream a research paper file:
    - `paper`: Original research paper PDF
    - `ppt`: Summary presentation (.pptx or .pdf)
    - `report`: Detailed simplified report (.pdf)
    - `highlights`: Key highlights summary (.pdf)
    """
    file_path = reference_svc.get_file_path(folder, file_type)
    if not file_path or not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resource '{file_type}' for paper '{folder}' not found.",
        )

    # Determine mime type
    mime_type, _ = mimetypes.guess_type(str(file_path))
    if not mime_type:
        if file_path.suffix.lower() == ".pptx":
            mime_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        elif file_path.suffix.lower() == ".docx":
            mime_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        elif file_path.suffix.lower() == ".pdf":
            mime_type = "application/pdf"
        else:
            mime_type = "application/octet-stream"

    # PDFs open inline in browser; PPTX and others prompt download
    disposition = "inline" if file_path.suffix.lower() == ".pdf" else "attachment"

    return FileResponse(
        path=file_path,
        media_type=mime_type,
        filename=file_path.name,
        headers={"Content-Disposition": f'{disposition}; filename="{file_path.name}"'},
    )


@router.get("/{folder}/highlights")
async def get_paper_highlights(folder: str):
    """Retrieve key highlights markdown for in-app reading."""
    res = reference_svc.get_paper_highlights(folder)
    if res.get("error"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=res["error"])
    return res


@router.get("/{folder}/report")
async def get_paper_report(folder: str):
    """Retrieve detailed simplified report markdown for in-app reading."""
    res = reference_svc.get_paper_report(folder)
    if res.get("error"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=res["error"])
    return res
