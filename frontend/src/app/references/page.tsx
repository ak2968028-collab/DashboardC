"use client";

import { useMemo, useState, useEffect } from "react";
import {
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileText,
  Lightbulb,
  Presentation,
  Search,
  Sparkles,
  Users,
  X,
  Building2,
  SlidersHorizontal,
} from "lucide-react";
import { useReferences, referenceFileUrl } from "@/lib/api";
import type { ResearchPaper } from "@/lib/types";
import { ReadingArticle, type ReadingMode } from "@/components/AcademicReader";
import { CarbonLoader } from "@/components/ui";

export default function ReferencesPage() {
  const { data: papers = [], isLoading } = useReferences();
  const [search, setSearch] = useState("");
  const [selectedYear, setSelectedYear] = useState<string>("All");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sideDoc, setSideDoc] = useState<{ paper: ResearchPaper; mode: ReadingMode } | null>(null);

  // Available publication years
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    papers.forEach((p) => {
      if (p.year) years.add(p.year);
    });
    return ["All", ...Array.from(years).sort().reverse()];
  }, [papers]);

  // Filtered papers
  const filteredPapers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return papers.filter((p) => {
      if (selectedYear !== "All" && p.year !== selectedYear) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.authors.toLowerCase().includes(q) ||
        p.journal.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.points.some((pt) => pt.title.toLowerCase().includes(q) || pt.text.toLowerCase().includes(q))
      );
    });
  }, [papers, search, selectedYear]);

  // Open any paper resource (PDF, PPT, Key Highlights, Report) on the right side and collapse left list to compact headings
  const openSideDoc = (paper: ResearchPaper, mode: ReadingMode) => {
    setSideDoc({ paper, mode });
    setExpandedIds(new Set());
  };

  // Toggle single card
  const toggleCard = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Expand all / Collapse all
  const toggleAll = () => {
    if (expandedIds.size === filteredPapers.length) {
      setExpandedIds(new Set());
    } else {
      setExpandedIds(new Set(filteredPapers.map((p) => p.id)));
    }
  };

  // Escape key closes side viewer and resets layout
  useEffect(() => {
    if (!sideDoc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSideDoc(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sideDoc]);

  const sideEmbedUrl = sideDoc
    ? sideDoc.mode === "paper" && sideDoc.paper.paper_file
      ? referenceFileUrl(sideDoc.paper.folder, "paper")
      : sideDoc.mode === "ppt" && sideDoc.paper.ppt_pdf
        ? referenceFileUrl(sideDoc.paper.folder, "ppt_pdf")
        : null
    : null;

  const sideDownloadUrl = sideDoc
    ? sideDoc.mode === "paper" && sideDoc.paper.paper_file
      ? referenceFileUrl(sideDoc.paper.folder, "paper")
      : sideDoc.mode === "ppt"
        ? referenceFileUrl(sideDoc.paper.folder, sideDoc.paper.ppt_file ? "ppt" : "ppt_pdf")
        : null
    : null;

  const sideModeLabel =
    sideDoc?.mode === "paper"
      ? "PDF"
      : sideDoc?.mode === "ppt"
        ? "PPT"
        : sideDoc?.mode === "highlights"
          ? "Highlights"
          : "Report";

  return (
    <div className={`references-page ${sideDoc ? "has-side-viewer" : ""}`}>
      {/* Search, Filter & Toolbar Bar */}
      <div className="references-toolbar">
        <div className="references-search-box">
          <Search size={18} className="references-search-icon" aria-hidden />
          <input
            type="text"
            className="references-search-input"
            placeholder="Search papers by title, author, journal, key topic..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search research papers"
          />
          {search && (
            <button
              type="button"
              className="references-clear-btn"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="references-toolbar-actions">
          {/* Year selector chips */}
          <div className="references-year-chips" role="group" aria-label="Filter by year">
            {availableYears.map((y) => (
              <button
                key={y}
                type="button"
                className={`references-year-chip ${y === selectedYear ? "active" : ""}`}
                onClick={() => setSelectedYear(y)}
              >
                {y}
              </button>
            ))}
          </div>

          <div className="references-meta-actions">
            <span className="references-count-badge">
              <BookOpen size={13} />
              <b>{filteredPapers.length}</b> {filteredPapers.length === 1 ? "paper" : "papers"}
            </span>

            {filteredPapers.length > 0 && (
              <button
                type="button"
                className="btn references-toggle-all-btn"
                onClick={toggleAll}
                title={expandedIds.size === filteredPapers.length ? "Collapse All Cards" : "Expand All Cards"}
              >
                <SlidersHorizontal size={13} />
                <span>{expandedIds.size === filteredPapers.length ? "Collapse All" : "Expand All"}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Vertically Arranged Papers List */}
      {isLoading ? (
        <CarbonLoader label="Loading research library…" />
      ) : filteredPapers.length === 0 ? (
        <div className="references-empty">
          <BookOpen size={40} className="references-empty-icon" />
          <h3>No research papers found</h3>
          <p>Try adjusting your search keywords or year filter to see available papers.</p>
          {(search || selectedYear !== "All") && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSearch("");
                setSelectedYear("All");
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className={`references-workspace ${sideDoc ? "split" : ""}`}>
          <div className="references-list-pane">
            <div className="references-vertical-list">
              {filteredPapers.map((paper, index) => {
                const isExpanded = expandedIds.has(paper.id);
                const isSideActive = sideDoc?.paper.id === paper.id;
                return (
                  <article
                    key={paper.id}
                    className={`research-paper-card ${isExpanded ? "expanded" : ""} ${isSideActive ? "active-doc" : ""}`}
                  >
                {/* Clickable Card Header */}
                <div
                  className="paper-card-header"
                  onClick={() => toggleCard(paper.id)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleCard(paper.id);
                    }
                  }}
                >
                  <div className="paper-card-icon-box" title="Academic Research Paper">
                    <BookOpen size={20} className="paper-icon" />
                    <span className="paper-index-badge">#{String(index + 1).padStart(2, "0")}</span>
                  </div>

                  <div className="paper-card-main-info">
                    <h2 className="paper-card-title">{paper.title}</h2>

                    {(!sideDoc || isExpanded) && (
                      <div className="paper-card-meta-row">
                        {paper.authors && (
                          <span className="paper-meta-item authors" title={`Authors: ${paper.authors}`}>
                            <Users size={13} className="meta-icon" />
                            <span className="meta-text">{paper.authors}</span>
                          </span>
                        )}

                        {paper.year && (
                          <span className="paper-meta-item year" title={`Publication Year: ${paper.year}`}>
                            <Calendar size={13} className="meta-icon" />
                            <span className="meta-text"><b>{paper.year}</b></span>
                          </span>
                        )}

                        {paper.journal && (
                          <span className="paper-meta-item journal" title={`Journal: ${paper.journal}`}>
                            <Building2 size={13} className="meta-icon" />
                            <span className="meta-text">{paper.journal}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="paper-card-expand-indicator" title={isExpanded ? "Collapse" : "Expand"}>
                    <span className="expand-label">{isExpanded ? "Hide" : "Details"}</span>
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>

                {/* Expanded Content Section */}
                {isExpanded && (
                  <div className="paper-card-body">
                    {/* 1. Short Description */}
                    <div className="paper-section paper-description-box">
                      <div className="section-label-row">
                        <span className="section-dot" />
                        <span className="section-label">Short Description &amp; Scope</span>
                      </div>
                      <p className="paper-description-text">
                        {paper.description ||
                          "A comprehensive environmental and carbon modeling analysis detailing sectoral emissions, mitigation strategies, and methodological frameworks."}
                      </p>
                    </div>

                    {/* 2. Original Research Paper Link (Opens on right side in same page) */}
                    <div className="paper-original-link-row">
                      {paper.paper_file ? (
                        <button
                          type="button"
                          className={`paper-original-link ${isSideActive && sideDoc?.mode === "paper" ? "active" : ""}`}
                          onClick={() => openSideDoc(paper, "paper")}
                          title="Open original research paper (PDF) on the right side"
                        >
                          <FileText size={15} className="link-icon" />
                          <span>Open Original Research Paper (PDF)</span>
                        </button>
                      ) : paper.doi ? (
                        <a
                          href={paper.doi}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="paper-original-link"
                          title="Access original research paper"
                        >
                          <FileText size={15} className="link-icon" />
                          <span>Access Original Research Paper (DOI)</span>
                          <ExternalLink size={13} className="link-ext" />
                        </a>
                      ) : (
                        <span className="paper-original-link disabled">
                          <FileText size={15} className="link-icon" />
                          <span>Original Paper Not Available</span>
                        </span>
                      )}
                    </div>

                    {/* 3. Three Horizontal Options Row */}
                    <div className="paper-options-row">
                      {/* Option 1: PPT (Opens on right side in same page) */}
                      {paper.ppt_pdf || paper.ppt_file ? (
                        <button
                          type="button"
                          className={`paper-option-link opt-ppt ${isSideActive && sideDoc?.mode === "ppt" ? "active" : ""}`}
                          onClick={() => openSideDoc(paper, "ppt")}
                          title="Open presentation slides on the right side"
                        >
                          <Presentation size={15} className="option-icon" />
                          <span>PPT</span>
                        </button>
                      ) : (
                        <span className="paper-option-link disabled" title="Presentation not available">
                          <Presentation size={15} className="option-icon" />
                          <span>PPT (Not Available)</span>
                        </span>
                      )}

                      {/* Option 2: Key Highlights (Opens on right side in same page) */}
                      {paper.highlights_md || (paper.points && paper.points.length > 0) || paper.highlights_file ? (
                        <button
                          type="button"
                          className={`paper-option-link opt-highlights ${isSideActive && sideDoc?.mode === "highlights" ? "active" : ""}`}
                          onClick={() => openSideDoc(paper, "highlights")}
                          title="Read Key Highlights on the right side"
                        >
                          <Lightbulb size={15} className="option-icon" />
                          <span>Key Highlights</span>
                          <Sparkles size={13} className="option-sub-icon" />
                        </button>
                      ) : (
                        <span className="paper-option-link disabled" title="Highlights not available">
                          <Lightbulb size={15} className="option-icon" />
                          <span>Key Highlights (Not Available)</span>
                        </span>
                      )}

                      {/* Option 3: Report (Opens on right side in same page) */}
                      {paper.report_md || paper.report_file ? (
                        <button
                          type="button"
                          className={`paper-option-link opt-report ${isSideActive && sideDoc?.mode === "report" ? "active" : ""}`}
                          onClick={() => openSideDoc(paper, "report")}
                          title="Read Complete Report on the right side"
                        >
                          <FileText size={15} className="option-icon" />
                          <span>Report</span>
                        </button>
                      ) : (
                        <span className="paper-option-link disabled" title="Report not available">
                          <FileText size={15} className="option-icon" />
                          <span>Report (Not Available)</span>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
            </div>
          </div>

          {/* Right-Side Google-Style Viewer Panel (PDF, PPT, Key Highlights, Full Report) */}
          {sideDoc && (
            <aside className="references-side-viewer" aria-label="Document Preview">
              <div className="side-viewer-header">
                <div className="side-viewer-tabs">
                  {sideDoc.paper.paper_file && (
                    <button
                      type="button"
                      className={`side-viewer-tab ${sideDoc.mode === "paper" ? "active" : ""}`}
                      onClick={() => setSideDoc({ paper: sideDoc.paper, mode: "paper" })}
                    >
                      <FileText size={14} />
                      <span>Paper (PDF)</span>
                    </button>
                  )}
                  {(sideDoc.paper.ppt_pdf || sideDoc.paper.ppt_file) && (
                    <button
                      type="button"
                      className={`side-viewer-tab ${sideDoc.mode === "ppt" ? "active" : ""}`}
                      onClick={() => setSideDoc({ paper: sideDoc.paper, mode: "ppt" })}
                    >
                      <Presentation size={14} />
                      <span>PPT</span>
                    </button>
                  )}
                  {(sideDoc.paper.highlights_md || (sideDoc.paper.points && sideDoc.paper.points.length > 0) || sideDoc.paper.highlights_file) && (
                    <button
                      type="button"
                      className={`side-viewer-tab ${sideDoc.mode === "highlights" ? "active" : ""}`}
                      onClick={() => setSideDoc({ paper: sideDoc.paper, mode: "highlights" })}
                    >
                      <Lightbulb size={14} />
                      <span>Key Highlights</span>
                    </button>
                  )}
                  {(sideDoc.paper.report_md || sideDoc.paper.report_file) && (
                    <button
                      type="button"
                      className={`side-viewer-tab ${sideDoc.mode === "report" ? "active" : ""}`}
                      onClick={() => setSideDoc({ paper: sideDoc.paper, mode: "report" })}
                    >
                      <FileText size={14} />
                      <span>Report</span>
                    </button>
                  )}
                </div>

                <div className="side-viewer-actions">
                  {sideDownloadUrl && (
                    <a
                      href={sideDownloadUrl}
                      download
                      className="side-viewer-btn"
                      title={sideDoc.mode === "ppt" && sideDoc.paper.ppt_file ? "Download PowerPoint (.pptx)" : "Download PDF"}
                    >
                      <Download size={14} />
                      <span>{sideDoc.mode === "ppt" && sideDoc.paper.ppt_file ? ".pptx" : "PDF"}</span>
                    </a>
                  )}
                  {sideEmbedUrl && (
                    <a
                      href={sideEmbedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="side-viewer-btn"
                      title="Open in full browser tab"
                    >
                      <ExternalLink size={14} />
                      <span>Fullscreen</span>
                    </a>
                  )}
                  {sideDoc.paper.doi && (
                    <a
                      href={sideDoc.paper.doi}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="side-viewer-btn"
                      title="View official publisher DOI"
                    >
                      <ExternalLink size={14} />
                      <span>DOI</span>
                    </a>
                  )}
                  <button
                    type="button"
                    className="side-viewer-close-btn"
                    onClick={() => setSideDoc(null)}
                    aria-label="Close document preview"
                    title="Close preview and reset layout (Esc)"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="side-viewer-subbar">
                <span className="side-viewer-badge">{sideModeLabel}</span>
                <span className="side-viewer-title" title={sideDoc.paper.title}>
                  {sideDoc.paper.title}
                </span>
              </div>

              {sideDoc.mode === "highlights" || sideDoc.mode === "report" ? (
                <div className="side-viewer-article-scroll">
                  <ReadingArticle paper={sideDoc.paper} mode={sideDoc.mode} showFooter={false} />
                </div>
              ) : sideEmbedUrl ? (
                <iframe
                  key={sideEmbedUrl}
                  src={`${sideEmbedUrl}#view=FitH`}
                  title={`${sideDoc.paper.title} — ${sideDoc.mode === "paper" ? "Research Paper PDF" : "Summary Presentation"}`}
                  className="side-viewer-frame"
                />
              ) : (
                <div className="side-viewer-fallback">
                  <Presentation size={44} className="empty-icon" />
                  <h3>Inline Preview Not Available</h3>
                  <p>Download the presentation file directly to view it.</p>
                  {sideDownloadUrl && (
                    <a href={sideDownloadUrl} download className="btn">
                      <Download size={14} />
                      <span>Download Presentation</span>
                    </a>
                  )}
                </div>
              )}
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
