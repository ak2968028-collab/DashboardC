"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import {
  ChevronDown, ChevronLeft, ChevronRight, Clock, Download, Eye, EyeOff, Layers, MapPin, Scale, Search, X,
} from "lucide-react";
import { reportPdfUrl, useBlocks } from "@/lib/api";
import { interpolate, SCALES } from "@/lib/colors";
import { fmt } from "@/lib/format";
import type { Village } from "@/lib/types";
import { ALL_BLOCKS, useDashboard } from "./DashboardContext";

/** Most rows rendered at once; typing narrows the list further. */
const MAX_ROWS = 150;

/** Closes a popover on outside click (anything outside the given elements). */
function useDismiss(open: boolean, close: () => void, refs: RefObject<HTMLElement | null>[]) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!refs.some((r) => r.current?.contains(e.target as Node))) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close, refs]);
}

/** Keeps the keyboard-highlighted option scrolled into view. */
function useScrollActive(listRef: RefObject<HTMLElement | null>, active: number, open: boolean) {
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [listRef, active, open]);
}

/** Moves the highlighted index for Arrow / Home / End / Page keys; returns true when handled. */
function moveActive(e: KeyboardEvent, count: number, setActive: (fn: (i: number) => number) => void) {
  const steps: Record<string, (i: number) => number> = {
    ArrowDown: (i) => Math.min(count - 1, i + 1),
    ArrowUp: (i) => Math.max(0, i - 1),
    PageDown: (i) => Math.min(count - 1, i + 8),
    PageUp: (i) => Math.max(0, i - 8),
    Home: () => 0,
    End: () => count - 1,
  };
  const step = steps[e.key];
  if (!step || !count) return false;
  e.preventDefault();
  setActive(step);
  return true;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + query.length)}</mark>{text.slice(i + query.length)}</>;
}

/** Per-capita emission scale shared by the option bars (95th percentile caps outliers). */
function usePerCapitaScale(villages: Village[]) {
  return useMemo(() => {
    const values = villages.map((v) => v.per_capita_co2e_kg_yr ?? 0).sort((a, b) => a - b);
    const cap = values[Math.floor(values.length * 0.95)] || 1;
    return (v: Village) => Math.min(1, (v.per_capita_co2e_kg_yr ?? 0) / cap);
  }, [villages]);
}

// ---------- Village search ----------

type Row = { village: Village; section?: string };

export function VillageCombobox({
  villages, value, onChange, label = "Village", placeholder = "Search village…", recentCodes = [], showCodes,
  clearOnSelect = false, disabled = false, inputRef,
}: {
  villages: Village[];
  value: string | null;
  onChange: (code: string) => void;
  label?: string;
  placeholder?: string;
  recentCodes?: string[];
  showCodes: boolean;
  /** Empty the box after choosing (for "add a village" pickers). */
  clearOnSelect?: boolean;
  disabled?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const ownInput = useRef<HTMLInputElement>(null);
  const input = inputRef ?? ownInput;
  const selected = villages.find((v) => v.village_code === value);
  const scale = usePerCapitaScale(villages);
  const multiBlock = useMemo(() => new Set(villages.map((v) => v.block_name)).size > 1, [villages]);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      const byCode = new Map(villages.map((v) => [v.village_code, v]));
      const recent = recentCodes.map((c) => byCode.get(c)).filter((v): v is Village => !!v && v.village_code !== value);
      const rest = villages.filter((v) => !recent.includes(v));
      return [
        ...recent.slice(0, 5).map((village, i) => ({ village, section: i === 0 ? "Recently viewed" : undefined })),
        ...rest.map((village, i) => ({ village, section: i === 0 && recent.length ? "All villages" : undefined })),
      ];
    }
    const numeric = /^\d+$/.test(q);
    const scored = villages.flatMap((v) => {
      const name = v.village_name.toLowerCase();
      const score = name.startsWith(q) ? 0
        : name.includes(q) ? 1
        : v.block_name.toLowerCase().includes(q) ? 2
        : (showCodes || numeric) && v.village_code.startsWith(q) ? 3 : -1;
      return score < 0 ? [] : [{ v, score }];
    });
    scored.sort((a, b) => a.score - b.score || a.v.village_name.localeCompare(b.v.village_name));
    return scored.map(({ v }) => ({ village: v }));
  }, [villages, query, recentCodes, value, showCodes]);

  const shown = rows.slice(0, MAX_ROWS);
  const close = () => { setOpen(false); setQuery(""); };
  useDismiss(open, close, [boxRef]);
  useScrollActive(listRef, active, open);

  function openList() {
    if (disabled) return;
    setOpen(true);
    setActive(0);
  }

  function choose(v: Village) {
    onChange(v.village_code);
    close();
    if (clearOnSelect) input.current?.blur();
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      e.preventDefault();
      openList();
      return;
    }
    if (moveActive(e, shown.length, setActive)) return;
    if (e.key === "Enter" && shown[active]) {
      e.preventDefault();
      choose(shown[active].village);
    } else if (e.key === "Escape") {
      close();
    } else if (e.key === "Tab") {
      close();
    }
  }

  const display = open ? query : clearOnSelect ? "" : selected ? selected.village_name : "";

  return (
    <div className={`combo ${open ? "open" : ""} ${disabled ? "disabled" : ""}`} ref={boxRef}>
      <label className="combo-label" htmlFor={`${id}-input`}>{label}</label>
      <div className="combo-control" onClick={() => { input.current?.focus(); if (!open) openList(); }}>
        <Search size={16} className="combo-icon" aria-hidden />
        <input
          ref={input}
          id={`${id}-input`}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && shown[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={selected && !clearOnSelect ? selected.village_name : placeholder}
          value={display}
          onFocus={openList}
          onChange={(e) => { setQuery(e.target.value); setActive(0); if (!open) setOpen(true); }}
          onKeyDown={onKey}
        />
        {selected && !open && !clearOnSelect && (
          <span className="combo-chip">{selected.block_name}{showCodes && <> · {selected.village_code}</>}</span>
        )}
        {open && query ? (
          <button type="button" className="combo-clear" aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()} onClick={() => { setQuery(""); setActive(0); input.current?.focus(); }}>
            <X size={15} />
          </button>
        ) : (
          <kbd className="combo-kbd" aria-hidden>/</kbd>
        )}
        <ChevronDown size={16} className="combo-chevron" aria-hidden />
      </div>
      {open && (
        <div className="combo-panel">
          <div className="combo-panel-head">
            <span>{query ? `${rows.length.toLocaleString()} match${rows.length === 1 ? "" : "es"}` : `${villages.length.toLocaleString()} villages`}</span>
            <span className="combo-legend"><span className="legend-swatch" /> kg CO₂e per person</span>
          </div>
          <ul className="combo-list" role="listbox" id={`${id}-list`} ref={listRef} aria-label={label}>
            {shown.map(({ village: v, section }, i) => (
              <li key={`${section ?? ""}${v.village_code}`} role="presentation">
                {section && (
                  <div className="combo-section" role="presentation">
                    {section === "Recently viewed" && <Clock size={12} />} {section}
                  </div>
                )}
                <div
                  id={`${id}-opt-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={v.village_code === value}
                  className={`combo-option ${i === active ? "active" : ""} ${v.village_code === value ? "selected" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(v)}
                >
                  <span className="opt-main">
                    <span className="opt-name"><Highlight text={v.village_name} query={query.trim()} /></span>
                    <span className="opt-meta">
                      {multiBlock && <span className="opt-block"><Highlight text={v.block_name} query={query.trim()} /></span>}
                      <span>{fmt(v.total_residents)} residents</span>
                      {showCodes && <code className="opt-code"><Highlight text={v.village_code} query={query.trim()} /></code>}
                    </span>
                  </span>
                  <span className="opt-metric" title={`${fmt(v.per_capita_co2e_kg_yr, 1)} kg CO₂e per person per year`}>
                    <span className="opt-bar">
                      <span style={{ width: `${Math.max(4, scale(v) * 100)}%`, background: interpolate(SCALES.reds, scale(v)) }} />
                    </span>
                    <span className="opt-value">{fmt(v.per_capita_co2e_kg_yr)}</span>
                  </span>
                </div>
              </li>
            ))}
            {!rows.length && <li className="combo-empty" role="presentation">No village matches “{query}”.</li>}
          </ul>
          {rows.length > MAX_ROWS && (
            <div className="combo-foot">Showing {MAX_ROWS} of {rows.length.toLocaleString()} — keep typing to narrow down.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Block picker ----------

function BlockPicker() {
  const { allVillages, selectedBlock, setSelectedBlock } = useDashboard();
  const { data: blocks = [] } = useBlocks();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const stats = useMemo(() => {
    const by = new Map<string, { count: number; co2: number }>();
    for (const v of allVillages) {
      const s = by.get(v.block_name) ?? { count: 0, co2: 0 };
      s.count += 1;
      s.co2 += v.total_co2e_t_yr ?? 0;
      by.set(v.block_name, s);
    }
    const total = { count: allVillages.length, co2: allVillages.reduce((a, v) => a + (v.total_co2e_t_yr ?? 0), 0) };
    return { by, total };
  }, [allVillages]);

  const options = [ALL_BLOCKS, ...blocks];
  const maxCo2 = Math.max(1, ...blocks.map((b) => stats.by.get(b)?.co2 ?? 0));
  const current = selectedBlock === ALL_BLOCKS ? stats.total : stats.by.get(selectedBlock);
  const close = () => setOpen(false);
  useDismiss(open, close, [boxRef]);
  useScrollActive(listRef, active, open);

  function toggle() {
    setActive(Math.max(0, options.indexOf(selectedBlock)));
    setOpen(!open);
  }

  function choose(block: string) {
    setSelectedBlock(block);
    close();
    buttonRef.current?.focus();
  }

  function onKey(e: KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      toggle();
      return;
    }
    if (!open) return;
    if (moveActive(e, options.length, setActive)) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === "Escape" || e.key === "Tab") {
      close();
    }
  }

  return (
    <div className={`combo block-picker ${open ? "open" : ""}`} ref={boxRef}>
      <span className="combo-label" id={`${id}-label`}>Block</span>
      <button
        ref={buttonRef}
        type="button"
        className="combo-control combo-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
        onClick={toggle}
        onKeyDown={onKey}
      >
        <Layers size={16} className="combo-icon" aria-hidden />
        <span className="combo-value" id={`${id}-value`}>{selectedBlock}</span>
        {current && <span className="combo-count">{current.count.toLocaleString()}</span>}
        <ChevronDown size={16} className="combo-chevron" aria-hidden />
      </button>
      {open && (
        <div className="combo-panel">
          <ul className="combo-list" role="listbox" ref={listRef} aria-labelledby={`${id}-label`}>
            {options.map((b, i) => {
              const s = b === ALL_BLOCKS ? stats.total : stats.by.get(b);
              return (
                <li
                  key={b}
                  id={`${id}-opt-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={b === selectedBlock}
                  className={`combo-option ${i === active ? "active" : ""} ${b === selectedBlock ? "selected" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(b)}
                >
                  <span className="opt-main">
                    <span className="opt-name">{b === ALL_BLOCKS ? "All blocks" : b}</span>
                    <span className="opt-meta">
                      {s ? `${s.count.toLocaleString()} villages · ${fmt(s.co2)} t CO₂e/yr` : "—"}
                    </span>
                  </span>
                  {b !== ALL_BLOCKS && s && (
                    <span className="opt-metric" title={`${fmt(s.co2)} t CO₂e per year`}>
                      <span className="opt-bar"><span style={{ width: `${(s.co2 / maxCo2) * 100}%`, background: "var(--green-700)" }} /></span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------- Census code visibility ----------

/** A census code that stays masked until the viewer chooses to show codes. */
export function CensusCode({ code, tone = "light" }: { code: string; tone?: "light" | "dark" }) {
  const { showCodes, setShowCodes } = useDashboard();
  return (
    <button
      type="button"
      className={`code-reveal ${tone} ${showCodes ? "shown" : ""}`}
      onClick={() => setShowCodes(!showCodes)}
      title={showCodes ? "Hide census codes" : "Show census code"}
      aria-label={showCodes ? `Census code ${code}. Hide census codes` : "Show census code"}
    >
      {showCodes ? <><span className="code-text">{code}</span><EyeOff size={13} /></> : <><span className="code-mask">••••••</span><Eye size={13} /></>}
    </button>
  );
}

// ---------- Toolbar ----------

/** Block + village selection bar shown above the dashboard pages. */
export function VillageToolbar() {
  const {
    filteredVillages, selectedCode, setSelectedCode, activeVillage, showCodes, setShowCodes, recentCodes,
  } = useDashboard();
  const searchRef = useRef<HTMLInputElement>(null);
  const index = filteredVillages.findIndex((v) => v.village_code === selectedCode);
  const step = (delta: number) => {
    if (!filteredVillages.length) return;
    const next = (index + delta + filteredVillages.length) % filteredVillages.length;
    setSelectedCode(filteredVillages[next].village_code);
  };

  // "/" jumps to the village search from anywhere on the page.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (target.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section className="toolbar" aria-label="Choose block and village">
      <BlockPicker />
      <div className="toolbar-village">
        <VillageCombobox
          villages={filteredVillages}
          value={selectedCode}
          onChange={setSelectedCode}
          recentCodes={recentCodes}
          showCodes={showCodes}
          inputRef={searchRef}
        />
        <div className="stepper" role="group" aria-label="Step through villages">
          <button type="button" className="stepper-btn" onClick={() => step(-1)} aria-label="Previous village" title="Previous village">
            <ChevronLeft size={16} />
          </button>
          <span className="stepper-pos" aria-live="polite">
            {index >= 0 ? `${(index + 1).toLocaleString()} / ${filteredVillages.length.toLocaleString()}` : "—"}
          </span>
          <button type="button" className="stepper-btn" onClick={() => step(1)} aria-label="Next village" title="Next village">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="toolbar-actions">
        <button
          type="button"
          className={`btn toggle ${showCodes ? "on" : ""}`}
          aria-pressed={showCodes}
          onClick={() => setShowCodes(!showCodes)}
          title={showCodes ? "Hide census codes" : "Show census codes"}
        >
          {showCodes ? <EyeOff size={16} /> : <Eye size={16} />} Codes
        </button>
        <Link href="/map" className="btn" title="Show on map"><MapPin size={16} /> Map</Link>
        <Link href="/comparison" className="btn"><Scale size={16} /> Compare</Link>
        {activeVillage ? (
          <a href={reportPdfUrl(activeVillage.village_code)} className="btn primary" download>
            <Download size={16} /> Report
          </a>
        ) : (
          <span className="btn primary disabled"><Download size={16} /> Report</span>
        )}
      </div>
    </section>
  );
}
