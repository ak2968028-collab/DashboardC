import os
import re
import time
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from app.conf.logging.applog import logger
# fast_backend root directory
BASE_DIR = Path(__file__).resolve().parents[3]

# Possible locations where Research_paper or Reaserch_carbon may be mounted or located
CANDIDATE_PATHS = [
    BASE_DIR.parent / "Research_paper",
    BASE_DIR.parent / "Reaserch_carbon",
    BASE_DIR / "Research_paper",
    BASE_DIR / "Reaserch_carbon",
    Path("/home/app/Research_paper"),
    Path("/home/app/Reaserch_carbon"),
    Path("Research_paper"),
    Path("Reaserch_carbon"),
]


class ReferenceService:
    def __init__(self):
        self._cached_papers: list[dict[str, Any]] | None = None
        self._last_scan_time: float = 0
        self._cache_ttl_seconds: float = 60.0  # re-scan every minute or on change

    def get_research_root(self) -> Path | None:
        for candidate in CANDIDATE_PATHS:
            try:
                resolved = candidate.resolve()
                if resolved.exists() and resolved.is_dir():
                    return resolved
            except Exception:
                continue
        return None

    def _extract_docx_paragraphs(self, path: Path | str) -> list[str]:
        p = Path(path)
        if not p.exists():
            return []
        try:
            with zipfile.ZipFile(p) as z:
                xml_content = z.read("word/document.xml")
                tree = ET.fromstring(xml_content)
                paragraphs: list[str] = []
                for elem in tree.iter():
                    if elem.tag.endswith("}p"):
                        p_text = "".join(c.text or "" for c in elem.iter() if c.tag.endswith("}t")).strip()
                        if p_text:
                            paragraphs.append(p_text)
                return paragraphs
        except Exception as e:
            logger.warning(f"Could not read docx {path}: {e}")
            return []

    def scan_papers(self, force: bool = False) -> list[dict[str, Any]]:
        now = time.time()
        if not force and self._cached_papers is not None and (now - self._last_scan_time < self._cache_ttl_seconds):
            return self._cached_papers

        root = self.get_research_root()
        if not root:
            logger.warning("No research paper root directory found in candidate paths.")
            return self._cached_papers or []

        papers: list[dict[str, Any]] = []
        try:
            entries = sorted(os.listdir(root))
        except Exception as e:
            logger.error(f"Failed to list directory {root}: {e}")
            return self._cached_papers or []

        for folder_name in entries:
            folder_path = root / folder_name
            if not folder_path.is_dir():
                continue

            try:
                items = os.listdir(folder_path)
            except Exception:
                continue

            # Original research paper PDF
            paper_pdf = next((x for x in items if x.lower().endswith(".pdf")), None)

            # Source_Link.txt
            title = ""
            doi = ""
            src_link_file = folder_path / "Source_Link.txt"
            if src_link_file.exists():
                try:
                    with open(src_link_file, "r", encoding="utf-8", errors="ignore") as sl:
                        lines = [line.strip() for line in sl.readlines() if line.strip()]
                        if lines:
                            title = lines[0].lstrip("\ufeff").strip()
                        if len(lines) > 1:
                            doi = lines[1].strip()
                except Exception:
                    pass

            # Simplified report
            rep_folder = folder_path / "1_Simplified_Report"
            rep_pdf = "Simplified_Report.pdf" if (rep_folder / "Simplified_Report.pdf").exists() else None
            rep_docx = rep_folder / "Simplified_Report.docx"
            rep_ps = self._extract_docx_paragraphs(rep_docx)

            authors = ""
            journal = ""
            year = ""
            description = ""

            for i, line in enumerate(rep_ps):
                line_lower = line.lower()
                if line_lower in ("authors", "author") and i + 1 < len(rep_ps):
                    authors = rep_ps[i + 1].strip()
                elif line_lower == "journal" and i + 1 < len(rep_ps):
                    journal = rep_ps[i + 1].strip()
                elif line == "IN ONE PARAGRAPH" and i + 1 < len(rep_ps):
                    description = rep_ps[i + 1].strip()
                elif line_lower == "dates" and i + 1 < len(rep_ps):
                    m = re.search(r"\b(20\d\d)\b", rep_ps[i + 1])
                    if m:
                        year = m.group(1)

            if not year and journal:
                m2 = re.search(r"\b(20\d\d)\b", journal)
                if m2:
                    year = m2.group(1)
            if not year:
                m3 = re.search(r"\b(20\d\d)\b", folder_name)
                if m3:
                    year = m3.group(1)

            # Summary PPT
            ppt_folder = folder_path / "2_Summary_PPT"
            ppt_file = "Summary.pptx" if (ppt_folder / "Summary.pptx").exists() else None
            ppt_pdf = "Summary.pdf" if (ppt_folder / "Summary.pdf").exists() else None

            # Key Highlights
            hl_folder = folder_path / "4_Key_Highlights"
            hl_pdf = "Key_Highlights.pdf" if (hl_folder / "Key_Highlights.pdf").exists() else None
            hl_docx = hl_folder / "Key_Highlights.docx"
            hl_ps = self._extract_docx_paragraphs(hl_docx)

            metrics: list[dict[str, str]] = []
            points: list[dict[str, str]] = []

            idx = 0
            while idx < len(hl_ps):
                line = hl_ps[idx]
                # Stat callouts
                if 3 <= idx < 12 and len(metrics) < 4:
                    if re.match(r"^[\d\.\+\-\~]+\s*(%|PgC|°C|Gt|Mt|ppm|kg|t|ha|billion|million|trillion|countries)?$", line) or (
                        len(line) <= 12 and any(c.isdigit() for c in line)
                    ):
                        if idx + 1 < len(hl_ps) and len(hl_ps[idx + 1]) < 100:
                            metrics.append({"value": line, "label": hl_ps[idx + 1]})
                            idx += 2
                            continue
                # Numbered points (01, 02, ...)
                if re.match(r"^\d{2}$", line) and idx + 1 < len(hl_ps):
                    num = line
                    p_title = hl_ps[idx + 1]
                    p_text = hl_ps[idx + 2] if idx + 2 < len(hl_ps) else ""
                    p_cite = (
                        hl_ps[idx + 3]
                        if idx + 3 < len(hl_ps) and (hl_ps[idx + 3].startswith("p.") or hl_ps[idx + 3].startswith("pp."))
                        else ""
                    )
                    points.append({"number": num, "title": p_title, "text": p_text, "citation": p_cite})
                    idx += 4 if p_cite else 3
                    continue
                idx += 1

            # Read highlights_md and report_md if available
            highlights_md = ""
            hl_md_file = folder_path / "key_highlights.md"
            if not hl_md_file.exists():
                hl_md_file = folder_path / "4_Key_Highlights" / "key_highlights.md"
            if hl_md_file.exists():
                try:
                    highlights_md = hl_md_file.read_text(encoding="utf-8", errors="ignore")
                except Exception:
                    pass

            report_md = ""
            rep_md_file = folder_path / "report.md"
            if not rep_md_file.exists():
                rep_md_file = folder_path / "1_Simplified_Report" / "report.md"
            if rep_md_file.exists():
                try:
                    report_md = rep_md_file.read_text(encoding="utf-8", errors="ignore")
                except Exception:
                    pass

            papers.append(
                {
                    "id": folder_name,
                    "folder": folder_name,
                    "title": title or folder_name.replace("_", " "),
                    "authors": authors,
                    "year": year,
                    "journal": journal,
                    "doi": doi,
                    "description": description,
                    "paper_file": paper_pdf,
                    "ppt_file": ppt_file,
                    "ppt_pdf": ppt_pdf,
                    "report_file": rep_pdf,
                    "highlights_file": hl_pdf,
                    "metrics": metrics,
                    "points": points,
                    "highlights_md": highlights_md,
                    "report_md": report_md,
                }
            )

        self._cached_papers = papers
        self._last_scan_time = now
        logger.info(f"Scanned {len(papers)} research papers from {root}")
        return papers

    def get_file_path(self, folder_name: str, file_type: str) -> Path | None:
        root = self.get_research_root()
        if not root:
            return None

        # Sanitize folder name to prevent path traversal
        clean_folder = os.path.basename(folder_name)
        folder_path = root / clean_folder
        if not folder_path.exists() or not folder_path.is_dir():
            return None

        file_type = file_type.lower()
        if file_type == "paper":
            for f in os.listdir(folder_path):
                if f.lower().endswith(".pdf"):
                    return folder_path / f
        elif file_type == "ppt":
            pptx = folder_path / "2_Summary_PPT" / "Summary.pptx"
            if pptx.exists():
                return pptx
            pdf = folder_path / "2_Summary_PPT" / "Summary.pdf"
            if pdf.exists():
                return pdf
        elif file_type == "report":
            pdf = folder_path / "1_Simplified_Report" / "Simplified_Report.pdf"
            if pdf.exists():
                return pdf
            docx = folder_path / "1_Simplified_Report" / "Simplified_Report.docx"
            if docx.exists():
                return docx
        elif file_type == "highlights":
            pdf = folder_path / "4_Key_Highlights" / "Key_Highlights.pdf"
            if pdf.exists():
                return pdf
            docx = folder_path / "4_Key_Highlights" / "Key_Highlights.docx"
            if docx.exists():
                return docx

        return None

    def get_paper_highlights(self, folder_name: str) -> dict[str, Any]:
        root = self.get_research_root()
        clean_folder = os.path.basename(folder_name)
        if not root:
            return {"folder": clean_folder, "markdown": "", "error": "Research folder not found"}

        folder_path = root / clean_folder
        if not folder_path.exists() or not folder_path.is_dir():
            return {"folder": clean_folder, "markdown": "", "error": "Paper directory not found"}

        # 1. Check for key_highlights.md
        for candidate in [folder_path / "key_highlights.md", folder_path / "4_Key_Highlights" / "key_highlights.md"]:
            if candidate.exists() and candidate.is_file():
                try:
                    return {"folder": clean_folder, "markdown": candidate.read_text(encoding="utf-8", errors="ignore")}
                except Exception as e:
                    logger.warning(f"Error reading {candidate}: {e}")

        # 2. Check for Key_Highlights.pdf
        hl_pdf = folder_path / "4_Key_Highlights" / "Key_Highlights.pdf"
        if hl_pdf.exists():
            try:
                import fitz
                doc = fitz.open(hl_pdf)
                text = "\n\n".join([page.get_text() for page in doc])
                return {"folder": clean_folder, "markdown": text}
            except Exception as e:
                logger.warning(f"Error extracting PDF {hl_pdf}: {e}")

        return {"folder": clean_folder, "markdown": "", "error": "Key highlights not available for this paper"}

    def get_paper_report(self, folder_name: str) -> dict[str, Any]:
        root = self.get_research_root()
        clean_folder = os.path.basename(folder_name)
        if not root:
            return {"folder": clean_folder, "markdown": "", "error": "Research folder not found"}

        folder_path = root / clean_folder
        if not folder_path.exists() or not folder_path.is_dir():
            return {"folder": clean_folder, "markdown": "", "error": "Paper directory not found"}

        # 1. Check for report.md
        for candidate in [folder_path / "report.md", folder_path / "1_Simplified_Report" / "report.md"]:
            if candidate.exists() and candidate.is_file():
                try:
                    return {"folder": clean_folder, "markdown": candidate.read_text(encoding="utf-8", errors="ignore")}
                except Exception as e:
                    logger.warning(f"Error reading {candidate}: {e}")

        # 2. Check for Simplified_Report.pdf or report.pdf
        for candidate in [folder_path / "1_Simplified_Report" / "Simplified_Report.pdf", folder_path / "report.pdf"]:
            if candidate.exists() and candidate.is_file():
                try:
                    import fitz
                    doc = fitz.open(candidate)
                    text = "\n\n".join([page.get_text() for page in doc])
                    return {"folder": clean_folder, "markdown": text}
                except Exception as e:
                    logger.warning(f"Error extracting PDF {candidate}: {e}")

        return {"folder": clean_folder, "markdown": "", "error": "Report not available for this paper"}


reference_svc = ReferenceService()
