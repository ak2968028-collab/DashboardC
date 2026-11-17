"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import {
  ChevronDown, Eye, EyeOff, MapPin, Scale, Search, X,
} from "lucide-react";
import { interpolate, SCALES } from "@/lib/colors";
import { fmt } from "@/lib/format";
import type { Village } from "@/lib/types";
import { useDashboard, type PlaceOption } from "./DashboardContext";

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

type Row = { village: Village };

export function VillageCombobox({
  villages, value, onChange, label = "Village", placeholder = "Search village…", showCodes,
  clearOnSelect = false, disabled = false, inputRef,
}: {
  villages: Village[];
  value: string | null;
  onChange: (code: string) => void;
  label?: string;
  placeholder?: string;
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
      return [...villages]
        .sort((a, b) => a.village_name.localeCompare(b.village_name))
        .map((village) => ({ village }));
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
  }, [villages, query, showCodes]);

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
            {shown.map(({ village: v }, i) => (
              <li key={v.village_code} role="presentation">
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

// ---------- Area dropdowns (Census 2011) ----------

function AreaSelect({ label, value, options, placeholder, allLabel, disabled, onChange }: {
  label: string;
  value: number | null;
  options: { code: number; name: string }[];
  placeholder: string;
  /** Offer an "all" choice (value null) instead of a placeholder. */
  allLabel?: string;
  disabled?: boolean;
  onChange: (code: number | null) => void;
}) {
  const id = useId();
  return (
    <div className={`combo area-select ${disabled ? "disabled" : ""}`}>
      <label className="combo-label" htmlFor={id}>{label}</label>
      <div className="combo-control">
        <MapPin size={16} className="combo-icon" aria-hidden />
        <select id={id} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
          {allLabel ? <option value="">{allLabel}</option> : <option value="" disabled>{placeholder}</option>}
          {options.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
        </select>
        <ChevronDown size={16} className="combo-chevron" aria-hidden />
      </div>
    </div>
  );
}

// ---------- Village picker over the selected area ----------

function PlaceCombobox({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }) {
  const { placeOptions, placesLoading, selectedCode, setSelectedCode, districtCode, showCodes } = useDashboard();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = placeOptions.find((p) => p.village_code === selectedCode);
  const surveyedCount = useMemo(() => placeOptions.filter((p) => p.survey).length, [placeOptions]);
  const surveyed = useMemo(() => placeOptions.flatMap((p) => (p.survey ? [p.survey] : [])), [placeOptions]);
  const scale = usePerCapitaScale(surveyed);
  const disabled = !districtCode;

  const rows = useMemo<PlaceOption[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return placeOptions;
    const numeric = /^\d+$/.test(q);
    const scored = placeOptions.flatMap((p) => {
      const name = p.village_name.toLowerCase();
      const score = name.startsWith(q) ? 0 : name.includes(q) ? 1 : numeric && p.village_code.startsWith(q) ? 2 : -1;
      return score < 0 ? [] : [{ p, score }];
    });
    // Surveyed villages first within each match quality.
    scored.sort((a, b) => a.score - b.score || Number(!a.p.survey) - Number(!b.p.survey)
      || a.p.village_name.localeCompare(b.p.village_name));
    return scored.map(({ p }) => p);
  }, [placeOptions, query]);

  const shown = rows.slice(0, MAX_ROWS);
  const close = () => { setOpen(false); setQuery(""); };
  useDismiss(open, close, [boxRef]);
  useScrollActive(listRef, active, open);

  function openList() {
    if (disabled) return;
    setOpen(true);
    setActive(0);
  }

  function choose(p: PlaceOption) {
    setSelectedCode(p.village_code);
    close();
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
      choose(shown[active]);
    } else if (e.key === "Escape" || e.key === "Tab") {
      close();
    }
  }

  const placeholder = disabled ? "Choose a district first" : placesLoading ? "Loading villages…" : "Search village…";

  return (
    <div className={`combo ${open ? "open" : ""} ${disabled ? "disabled" : ""}`} ref={boxRef}>
      <label className="combo-label" htmlFor={`${id}-input`}>Village</label>
      <div className="combo-control" onClick={() => { inputRef.current?.focus(); if (!open) openList(); }}>
        <Search size={16} className="combo-icon" aria-hidden />
        <input
          ref={inputRef}
          id={`${id}-input`}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && shown[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={selected ? selected.village_name : placeholder}
          value={open ? query : selected ? selected.village_name : ""}
          onFocus={openList}
          onChange={(e) => { setQuery(e.target.value); setActive(0); if (!open) setOpen(true); }}
          onKeyDown={onKey}
        />
        {selected && !open && (
          <span className={`combo-chip ${selected.survey ? "" : "muted"}`}>
            {selected.survey ? "Survey data" : "No data yet"}{showCodes && <> · {selected.village_code}</>}
          </span>
        )}
        {open && query ? (
          <button type="button" className="combo-clear" aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()} onClick={() => { setQuery(""); setActive(0); inputRef.current?.focus(); }}>
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
            <span>
              {query
                ? `${rows.length.toLocaleString()} match${rows.length === 1 ? "" : "es"}`
                : `${placeOptions.length.toLocaleString()} villages · ${surveyedCount.toLocaleString()} with survey data`}
            </span>
            {surveyedCount > 0 && <span className="combo-legend"><span className="legend-swatch" /> kg CO₂e per person</span>}
          </div>
          <ul className="combo-list" role="listbox" id={`${id}-list`} ref={listRef} aria-label="Village">
            {shown.map((p, i) => (
              <li key={p.village_code} role="presentation">
                <div
                  id={`${id}-opt-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={p.village_code === selectedCode}
                  className={`combo-option ${i === active ? "active" : ""} ${p.village_code === selectedCode ? "selected" : ""} ${p.survey ? "" : "no-data"}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(p)}
                >
                  <span className="opt-main">
                    <span className="opt-name"><Highlight text={p.village_name} query={query.trim()} /></span>
                    <span className="opt-meta">
                      {p.survey ? (
                        <><span className="opt-block">{p.survey.block_name}</span><span>{fmt(p.survey.total_residents)} residents</span></>
                      ) : (
                        <span>No survey data{p.population_2011 ? ` · ${p.population_2011.toLocaleString()} people (2011)` : ""}</span>
                      )}
                      {showCodes && <code className="opt-code"><Highlight text={p.village_code} query={query.trim()} /></code>}
                    </span>
                  </span>
                  {p.survey && (
                    <span className="opt-metric" title={`${fmt(p.survey.per_capita_co2e_kg_yr, 1)} kg CO₂e per person per year`}>
                      <span className="opt-bar">
                        <span style={{ width: `${Math.max(4, scale(p.survey) * 100)}%`, background: interpolate(SCALES.reds, scale(p.survey)) }} />
                      </span>
                      <span className="opt-value">{fmt(p.survey.per_capita_co2e_kg_yr)}</span>
                    </span>
                  )}
                </div>
              </li>
            ))}
            {!rows.length && (
              <li className="combo-empty" role="presentation">
                {placesLoading ? "Loading villages…" : query ? <>No village matches “{query}”.</> : "No villages in this area."}
              </li>
            )}
          </ul>
          {rows.length > MAX_ROWS && (
            <div className="combo-foot">Showing {MAX_ROWS} of {rows.length.toLocaleString()} — keep typing to narrow down.</div>
          )}
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

/** State > District > Sub-district > Village selection bar shown above the dashboard pages. */
export function VillageToolbar() {
  const {
    states, districts, subdistricts, stateCode, districtCode, subdistrictCode,
    setStateCode, setDistrictCode, setSubdistrictCode,
  } = useDashboard();
  const searchRef = useRef<HTMLInputElement>(null);

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
    <section className="toolbar" aria-label="Choose state, district, sub-district and village">
      <div className="toolbar-area">
        <AreaSelect label="State" value={stateCode} placeholder="Select state…" onChange={setStateCode}
          options={states.map((s) => ({ code: s.state_code, name: s.state_name }))} />
        <AreaSelect label="District" value={districtCode} placeholder="Select district…" disabled={!stateCode}
          onChange={setDistrictCode} options={districts.map((d) => ({ code: d.district_code, name: d.district_name }))} />
        <AreaSelect label="Sub-district" value={subdistrictCode} placeholder="" allLabel="All sub-districts"
          disabled={!districtCode} onChange={setSubdistrictCode}
          options={subdistricts.map((s) => ({ code: s.subdistrict_code, name: s.subdistrict_name }))} />
      </div>
      <div className="toolbar-village">
        <PlaceCombobox inputRef={searchRef} />
      </div>
      <div className="toolbar-actions">
        <Link href="/comparison" className="btn"><Scale size={16} /> Compare</Link>
      </div>
    </section>
  );
}
