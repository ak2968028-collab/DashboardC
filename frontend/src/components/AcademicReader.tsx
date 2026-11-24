"use client";

import React, { Fragment, type ReactNode } from "react";
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  ExternalLink,
  FileText,
  Lightbulb,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import type { ResearchPaper } from "@/lib/types";

/** Safe inline parser for bold, italic, code, and external links */
export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Matches: **bold**, *italic*, `code`, [label](url)
  const re = /\*\*(.+?)\*\*|\*([^*]+?)\*|`([^`]+?)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) {
      out.push(text.slice(last, m.index));
    }
    if (m[1]) {
      out.push(<strong key={m.index}>{m[1]}</strong>);
    } else if (m[2]) {
      out.push(<em key={m.index}>{m[2]}</em>);
    } else if (m[3]) {
      out.push(<code key={m.index} className="inline-code">{m[3]}</code>);
    } else if (m[4] && m[5]) {
      out.push(
        <a key={m.index} href={m[5]} target="_blank" rel="noopener noreferrer" className="academic-ext-link">
          {m[4]}
          <ExternalLink size={12} className="inline-ext-icon" />
        </a>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push(text.slice(last));
  }
  return out;
}

/** Markdown parser for academic reports and summaries */
export function AcademicMarkdown({ content }: { content: string }) {
  if (!content) return null;

  // Split by double line breaks into logical blocks
  const rawBlocks = content
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div className="academic-markdown-body">
      {rawBlocks.map((block, idx) => {
        const lines = block.split("\n").map((l) => l.trim());

        // 1. Table Detection (| Header | Header |)
        if (lines.length >= 2 && lines.every((l) => l.startsWith("|") && l.endsWith("|"))) {
          const rows = lines.map((l) =>
            l.split("|").slice(1, -1).map((c) => c.trim())
          );
          const headers = rows[0];
          // Filter out separator lines like |---|---|
          const bodyRows = rows.slice(1).filter((r) => !r.every((c) => /^[-:\s]+$/.test(c)));

          return (
            <div key={idx} className="academic-table-wrap">
              <table className="academic-table">
                <thead>
                  <tr>
                    {headers.map((h, i) => (
                      <th key={i}>{renderInline(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bodyRows.map((r, rIdx) => (
                    <tr key={rIdx}>
                      {r.map((c, cIdx) => (
                        <td key={cIdx}>{renderInline(c)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // 2. Headings
        if (block.startsWith("# ")) {
          return <h1 key={idx} className="academic-h1">{renderInline(block.slice(2))}</h1>;
        }
        if (block.startsWith("## ")) {
          return <h2 key={idx} className="academic-h2">{renderInline(block.slice(3))}</h2>;
        }
        if (block.startsWith("### ")) {
          return <h3 key={idx} className="academic-h3">{renderInline(block.slice(4))}</h3>;
        }
        if (block.startsWith("#### ")) {
          return <h4 key={idx} className="academic-h4">{renderInline(block.slice(5))}</h4>;
        }

        // 3. Blockquotes / Callout boxes
        if (lines.every((l) => l.startsWith(">"))) {
          const cleaned = lines.map((l) => l.replace(/^>\s*/, "")).join(" ");
          return (
            <blockquote key={idx} className="academic-callout">
              <div className="callout-content">{renderInline(cleaned)}</div>
            </blockquote>
          );
        }

        // 4. Bullet lists
        if (lines.every((l) => /^[-*•] /.test(l))) {
          return (
            <ul key={idx} className="academic-list">
              {lines.map((l, lIdx) => (
                <li key={lIdx}>{renderInline(l.replace(/^[-*•]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }

        // 5. Ordered lists
        if (lines.every((l) => /^\d+\.\s+/.test(l))) {
          return (
            <ol key={idx} className="academic-ordered-list">
              {lines.map((l, lIdx) => (
                <li key={lIdx}>{renderInline(l.replace(/^\d+\.\s+/, ""))}</li>
              ))}
            </ol>
          );
        }

        // 6. Regular paragraphs
        return (
          <p key={idx} className="academic-p">
            {lines.map((l, lIdx) => (
              <Fragment key={lIdx}>
                {lIdx > 0 && " "}
                {renderInline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

interface ReadingViewProps {
  paper: ResearchPaper;
  mode: "highlights" | "report";
  onClose: () => void;
  onSwitchMode: (mode: "highlights" | "report") => void;
}

/** Full in-app reading overlay view */
export default function ReadingView({
  paper,
  mode,
  onClose,
  onSwitchMode,
}: ReadingViewProps) {
  const content = mode === "highlights" ? paper.highlights_md : paper.report_md;

  return (
    <div className="reader-overlay" role="dialog" aria-modal="true">
      <div className="reader-container">
        {/* Top Sticky Navigation Bar */}
        <header className="reader-nav-bar">
          <div className="reader-nav-left">
            <button
              type="button"
              className="btn reader-back-btn"
              onClick={onClose}
              title="Return to references list"
            >
              <ArrowLeft size={16} />
              <span>Back to References</span>
            </button>
          </div>

          <div className="reader-nav-tabs">
            <button
              type="button"
              className={`reader-tab ${mode === "highlights" ? "active" : ""}`}
              onClick={() => onSwitchMode("highlights")}
            >
              <Lightbulb size={15} />
              <span>Key Highlights</span>
            </button>

            <button
              type="button"
              className={`reader-tab ${mode === "report" ? "active" : ""}`}
              onClick={() => onSwitchMode("report")}
            >
              <FileText size={15} />
              <span>Full Report</span>
            </button>
          </div>

          <div className="reader-nav-right">
            <button
              type="button"
              className="icon-btn reader-close-btn"
              onClick={onClose}
              aria-label="Close reader"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Reader Document Body */}
        <main className="reader-main-scroll">
          <div className="reader-document">
            {/* Document Header */}
            <div className="reader-doc-header">
              <div className="reader-doc-badge">
                {mode === "highlights" ? (
                  <>
                    <Sparkles size={14} />
                    <span>Executive Key Highlights &amp; Findings</span>
                  </>
                ) : (
                  <>
                    <FileText size={14} />
                    <span>Complete Research Paper Report</span>
                  </>
                )}
              </div>

              <h1 className="reader-doc-title">{paper.title}</h1>

              <div className="reader-doc-meta">
                {paper.authors && (
                  <span className="doc-meta-item authors">
                    <Users size={14} />
                    <span>{paper.authors}</span>
                  </span>
                )}

                {paper.journal && (
                  <span className="doc-meta-item journal">
                    <Building2 size={14} />
                    <span>{paper.journal}</span>
                  </span>
                )}

                {paper.year && (
                  <span className="doc-meta-item year">
                    <Calendar size={14} />
                    <span><b>{paper.year}</b></span>
                  </span>
                )}

                {paper.doi && (
                  <a
                    href={paper.doi}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="doc-meta-item doi-link"
                    title="View official publisher DOI"
                  >
                    <ExternalLink size={13} />
                    <span>Official DOI</span>
                  </a>
                )}
              </div>
            </div>

            {/* If in Highlights mode and metrics exist, display metric callout cards */}
            {mode === "highlights" && paper.metrics && paper.metrics.length > 0 && (
              <div className="reader-metrics-section">
                <h3 className="reader-section-title">
                  <CheckCircle2 size={16} /> Key Quantitative Indicators
                </h3>
                <div className="reader-metrics-grid">
                  {paper.metrics.map((m, idx) => (
                    <div key={idx} className="reader-metric-card">
                      <div className="metric-val">{m.value}</div>
                      <div className="metric-lbl">{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Document Markdown Content */}
            <div className="reader-doc-content">
              {content ? (
                <AcademicMarkdown content={content} />
              ) : (
                <div className="reader-empty-state">
                  <FileText size={48} className="empty-icon" />
                  <h3>Content Not Available</h3>
                  <p>
                    {mode === "highlights"
                      ? "The key highlights document is currently not available for this research paper."
                      : "The detailed report document is currently not available for this research paper."}
                  </p>
                  <button type="button" className="btn" onClick={onClose}>
                    Return to References
                  </button>
                </div>
              )}
            </div>

            {/* Reader Footer */}
            <div className="reader-doc-footer">
              <div className="footer-left">
                <span>End of {mode === "highlights" ? "Key Highlights" : "Report"}</span>
              </div>
              <div className="footer-right">
                <button
                  type="button"
                  className="btn reader-bottom-back-btn"
                  onClick={onClose}
                >
                  <ArrowLeft size={14} />
                  <span>Back to References</span>
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
