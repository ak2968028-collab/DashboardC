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
import ReadingView from "@/components/AcademicReader";

export default function ReferencesPage() {
  const { data: papers = [], isLoading } = useReferences();
  const [search, setSearch] = useState("");
  const [selectedYear, setSelectedYear] = useState<string>("All");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [readingPaper, setReadingPaper] = useState<ResearchPaper | null>(null);
  const [readingMode, setReadingMode] = useState<"highlights" | "report">("highlights");

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

  // Lock body scroll when reading view is open
  useEffect(() => {
    if (!readingPaper) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setReadingPaper(null);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [readingPaper]);

  return (
    <div className="references-page">
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
        <div className="loading">Loading research library…</div>
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
        <div className="references-vertical-list">
          {filteredPapers.map((paper, index) => {
            const isExpanded = expandedIds.has(paper.id);
            return (
              <article
                key={paper.id}
                className={`research-paper-card ${isExpanded ? "expanded" : ""}`}
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

                    {/* 2. Original Research Paper Link */}
                    <div className="paper-original-link-row">
                      {paper.doi || paper.paper_file ? (
                        <a
                          href={paper.doi || (paper.paper_file ? referenceFileUrl(paper.folder, "paper") : "#")}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="paper-original-link"
                          title="Access original research paper"
                        >
                          <FileText size={15} className="link-icon" />
                          <span>Access Original Research Paper (PDF)</span>
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
                      {/* Option 1: PPT */}
                      {paper.ppt_file ? (
                        <a
                          href={referenceFileUrl(paper.folder, "ppt")}
                          download
                          className="paper-option-link opt-ppt"
                          title="Download and open presentation (.pptx)"
                        >
                          <Presentation size={15} className="option-icon" />
                          <span>PPT</span>
                          <Download size={13} className="option-sub-icon" />
                        </a>
                      ) : (
                        <span className="paper-option-link disabled" title="Presentation not available">
                          <Presentation size={15} className="option-icon" />
                          <span>PPT (Not Available)</span>
                        </span>
                      )}

                      {/* Option 2: Key Highlights */}
                      {paper.highlights_md || (paper.points && paper.points.length > 0) || paper.highlights_file ? (
                        <button
                          type="button"
                          className="paper-option-link opt-highlights"
                          onClick={() => {
                            setReadingPaper(paper);
                            setReadingMode("highlights");
                          }}
                          title="Read Key Highlights"
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

                      {/* Option 3: Report */}
                      {paper.report_md || paper.report_file ? (
                        <button
                          type="button"
                          className="paper-option-link opt-report"
                          onClick={() => {
                            setReadingPaper(paper);
                            setReadingMode("report");
                          }}
                          title="Read Complete Report"
                        >
                          <FileText size={15} className="option-icon" />
                          <span>Report</span>
                          <ExternalLink size={13} className="option-sub-icon" />
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
      )}

      {/* In-App Reading View (Key Highlights & Full Report) */}
      {readingPaper && (
        <ReadingView
          paper={readingPaper}
          mode={readingMode}
          onClose={() => setReadingPaper(null)}
          onSwitchMode={(m) => setReadingMode(m)}
        />
      )}
    </div>
  );
}
