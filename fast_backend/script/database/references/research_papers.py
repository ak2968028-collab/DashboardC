"""Loads the research papers of the References page from media/Research_paper into the database:

  media/Research_paper/references.json        metadata (title, authors, year, journal, DOI, description, metrics,
                                              key points), one entry per paper folder
  media/Research_paper/<folder>/              *.pdf (the paper), key_highlights.md and report.md (in-app reading),
    2_Summary_PPT/Summary.pptx|pdf, 1_Simplified_Report/Simplified_Report.pdf|docx,
    4_Key_Highlights/Key_Highlights.pdf|docx  -> research_paper_files (the documents themselves)

Fills empty tables only, so re-running is safe. Usage (from fast_backend/): python script/database/references/research_papers.py"""
import json
import mimetypes
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_connection import MEDIA_DIR, engine, table_has_rows  # noqa: E402
from sqlalchemy import text  # noqa: E402

ROOT = Path(MEDIA_DIR) / "Research_paper"
METADATA = ROOT / "references.json"

CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def _first(*paths: Path) -> Path | None:
    return next((p for p in paths if p.is_file()), None)


def _documents(folder: Path, entry: dict) -> dict[str, Path]:
    """file_type -> document on disk, in the order the API prefers them."""
    named = folder / entry["paper_file"] if entry.get("paper_file") else None
    paper = named if named and named.is_file() else next(iter(sorted(folder.glob("*.pdf"))), None)
    docs = {
        "paper": paper,
        "ppt": _first(folder / "2_Summary_PPT" / "Summary.pptx"),
        "ppt_pdf": _first(folder / "2_Summary_PPT" / "Summary.pdf"),
        "report": _first(folder / "1_Simplified_Report" / "Simplified_Report.pdf",
                         folder / "1_Simplified_Report" / "Simplified_Report.docx"),
        "highlights": _first(folder / "4_Key_Highlights" / "Key_Highlights.pdf",
                             folder / "4_Key_Highlights" / "Key_Highlights.docx"),
    }
    return {k: v for k, v in docs.items() if v}


def _markdown(folder: Path, name: str, subfolder: str, fallback: str) -> str:
    path = _first(folder / name, folder / subfolder / name)
    return path.read_text(encoding="utf-8", errors="ignore") if path else (fallback or "")


def load():
    if table_has_rows("research_papers"):
        print("research_papers already has data, skipping.")
        return
    entries = json.loads(METADATA.read_text(encoding="utf-8"))
    papers = files = size = 0
    for order, entry in enumerate(entries):
        folder = ROOT / entry["folder"]
        if not folder.is_dir():
            print(f"  skipping {entry['folder']}: folder not found in {ROOT}")
            continue
        with engine.begin() as con:
            paper_id = con.execute(text("""
                INSERT INTO research_papers (folder, sort_order, title, authors, year, journal, doi, description,
                                             metrics, points, highlights_md, report_md)
                VALUES (:folder, :sort_order, :title, :authors, :year, :journal, :doi, :description,
                        CAST(:metrics AS jsonb), CAST(:points AS jsonb), :highlights_md, :report_md)
                RETURNING id"""), {
                "folder": entry["folder"], "sort_order": order, "title": entry.get("title") or entry["folder"],
                "authors": entry.get("authors") or "", "year": str(entry.get("year") or ""),
                "journal": entry.get("journal") or "", "doi": entry.get("doi") or None,
                "description": entry.get("description") or "",
                "metrics": json.dumps(entry.get("metrics") or []), "points": json.dumps(entry.get("points") or []),
                "highlights_md": _markdown(folder, "key_highlights.md", "4_Key_Highlights", entry.get("highlights_md")),
                "report_md": _markdown(folder, "report.md", "1_Simplified_Report", entry.get("report_md")),
            }).scalar_one()
            for file_type, path in _documents(folder, entry).items():
                data = path.read_bytes()
                con.execute(text("""
                    INSERT INTO research_paper_files (paper_id, file_type, filename, content_type, size_bytes, data)
                    VALUES (:paper_id, :file_type, :filename, :content_type, :size_bytes, :data)"""), {
                    "paper_id": paper_id, "file_type": file_type, "filename": path.name,
                    "content_type": CONTENT_TYPES.get(path.suffix.lower())
                                    or mimetypes.guess_type(path.name)[0] or "application/octet-stream",
                    "size_bytes": len(data), "data": data,
                })
                files += 1
                size += len(data)
        papers += 1
    print(f"{papers} research papers with {files} documents ({size / 1e6:,.0f} MB) from {ROOT} "
          f"have been successfully inserted into research_papers / research_paper_files.")


if __name__ == "__main__":
    try:
        load()
    except Exception as e:
        print("An error occurred:", e)
        sys.exit(1)
