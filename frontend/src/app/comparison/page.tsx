"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Link2,
  RotateCcw,
  Table2,
  X,
} from "lucide-react";
import { QUALITATIVE, SimpleBarChart } from "@/components/charts";
import { useDashboard, villageLabel } from "@/components/DashboardContext";
import type { Basemap, SwipeLayer } from "@/components/SwipeMap";
import { VillageCombobox } from "@/components/VillageSelector";
import { CarbonLoader } from "@/components/ui";
import { useEmissionGrid } from "@/lib/api";
import { fmt, num } from "@/lib/format";
import type { Village } from "@/lib/types";

// Leaflet needs the browser window, so the maps are client-only.
const DualMaps = dynamic(() => import("@/components/SwipeMap"), {
  ssr: false,
  loading: () => <CarbonLoader className="dual-map-loading" label="Loading side-by-side comparison maps…" />,
});

const LAYERS: { key: SwipeLayer; label: string }[] = [
  { key: "total", label: "Total emissions (t CO₂e/ha/yr)" },
  { key: "firewood", label: "Firewood" },
  { key: "livestock", label: "Livestock" },
  { key: "electricity", label: "Grid electricity" },
  { key: "waste", label: "Solid waste" },
  { key: "lpg", label: "LPG" },
  { key: "transport", label: "Motorbike petrol" },
  { key: "landcover", label: "Land cover (khasra parcels)" },
  { key: "none", label: "Boundary only" },
];

const LANDCOVER_LEGEND = [
  ["Built-up", "#d9c7a5"],
  ["Cropland", "#aed581"],
  ["Trees", "#2e7d32"],
  ["Water", "#4fc3f7"],
  ["Rangeland", "#c0a96e"],
  ["Bare ground", "#bcaaa4"],
];

const MAX_VILLAGES = 5;

const MATRIX: { label: string; key: keyof Village; decimals?: number }[] = [
  { label: "Block", key: "block_name" },
  { label: "Residents", key: "total_residents", decimals: 0 },
  { label: "Households", key: "total_households", decimals: 0 },
  { label: "Total Area (ha)", key: "total_area_ha", decimals: 2 },
  { label: "Built-up (ha)", key: "builtup_area_ha", decimals: 2 },
  { label: "Agricultural (ha)", key: "agri_area_ha", decimals: 2 },
  { label: "Water Bodies (ha)", key: "total_water_area_ha", decimals: 2 },
  { label: "LPG (kg/mo)", key: "lpg_monthly_kg", decimals: 1 },
  { label: "Firewood (kg/mo)", key: "firewood_monthly_kg", decimals: 1 },
  { label: "Electricity (kWh/mo)", key: "electricity_monthly_kwh", decimals: 1 },
  { label: "Solid Waste (kg/mo)", key: "waste_monthly_kg", decimals: 1 },
  { label: "Motorbikes", key: "motorbikes_count", decimals: 0 },
  { label: "Petrol (L/mo)", key: "petrol_monthly_litres", decimals: 1 },
  { label: "Total Livestock", key: "total_livestock", decimals: 0 },
  { label: "Total Carbon (t/yr)", key: "total_co2e_t_yr", decimals: 2 },
  { label: "Per Capita (kg/yr)", key: "per_capita_co2e_kg_yr", decimals: 2 },
];

export default function ComparisonPage() {
  const {
    allVillages,
    filteredVillages,
    states,
    districts,
    subdistricts,
    stateCode,
    districtCode,
    subdistrictCode,
    setStateCode,
    setDistrictCode,
    setSubdistrictCode,
    selectedCode,
    showCodes,
  } = useDashboard();

  const [codes, setCodes] = useState<string[]>([]);
  const [layer, setLayer] = useState<SwipeLayer>("total");
  const [basemap, setBasemap] = useState<Basemap>("streets");
  const [syncZoom, setSyncZoom] = useState(true);

  // SCALGO 3-pane workbench state
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [rightTab, setRightTab] = useState<"chart" | "matrix">("chart");
  const [showHelp, setShowHelp] = useState(false);
  const [openSections, setOpenSections] = useState({
    location: true,
    villages: true,
    layer: true,
    multi: true,
  });

  // Default: active village + next surveyed village
  useEffect(() => {
    if (codes.length || !selectedCode) return;
    const pool = filteredVillages.length ? filteredVillages : allVillages;
    const other = pool.find((v) => v.village_code !== selectedCode) ?? allVillages.find((v) => v.village_code !== selectedCode);
    setCodes(other ? [selectedCode, other.village_code] : [selectedCode]);
  }, [selectedCode, filteredVillages, allVillages, codes.length]);

  const byCode = useMemo(() => new Map(allVillages.map((v) => [v.village_code, v])), [allVillages]);
  const pool = filteredVillages.length ? filteredVillages : allVillages;
  const chosen = codes.map((c) => byCode.get(c)).filter((v): v is Village => !!v);
  const available = pool.filter((v) => !codes.includes(v.village_code));
  const [left, right] = chosen;
  const { data: legendGrid } = useEmissionGrid(left?.village_code ?? null);
  const legend = layer !== "landcover" && layer !== "none" ? (legendGrid?.legends[layer] ?? []).filter((l) => l.opacity > 0) : [];

  const setSlot = (i: number, code: string) => {
    const next = [...codes];
    const existing = next.indexOf(code);
    if (existing >= 0) [next[existing], next[i]] = [next[i], next[existing]];
    else next[i] = code;
    setCodes(next.filter(Boolean));
  };

  const swapPair = () => {
    if (chosen.length < 2) return;
    setCodes([codes[1], codes[0], ...codes.slice(2)]);
  };

  const resetAll = () => {
    setSubdistrictCode(null);
    setLayer("total");
    setBasemap("streets");
    setSyncZoom(true);
    if (selectedCode) {
      const other = allVillages.find((v) => v.village_code !== selectedCode);
      setCodes(other ? [selectedCode, other.village_code] : [selectedCode]);
    }
  };

  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const openRightTab = (tab: "chart" | "matrix") => {
    setRightTab(tab);
    setRightOpen(true);
  };

  const sectorCompare = useMemo(() => {
    if (!left || !right) return [];
    const items = [
      { label: "Energy", a: num(left.energy_total_co2e_t_yr), b: num(right.energy_total_co2e_t_yr) },
      { label: "Transport", a: num(left.transport_co2e_t_yr), b: num(right.transport_co2e_t_yr) },
      { label: "Waste", a: num(left.waste_co2e_t_yr), b: num(right.waste_co2e_t_yr) },
      { label: "Livestock", a: num(left.livestock_co2e_t_yr), b: num(right.livestock_co2e_t_yr) },
    ];
    const peak = Math.max(...items.flatMap((x) => [x.a, x.b]), 0.01);
    return items.map((x) => ({
      ...x,
      pctA: Math.round((x.a / peak) * 100),
      pctB: Math.round((x.b / peak) * 100),
    }));
  }, [left, right]);

  const layoutTick = (leftOpen ? 1 : 0) + (rightOpen ? 2 : 0);

  return (
    <div className="scalgo-workbench">
      {/* Top Dark Forest-Green Workbench Bar */}
      <header className="scalgo-topbar">
        <div className="scalgo-topbar-left">
          <span className="scalgo-brand-dot" aria-hidden />
          <div className="scalgo-brand-text">
            <span className="scalgo-brand-title">Village Comparison Workbench</span>
            <span className="scalgo-brand-sub">
              {left && right ? `${left.village_name} vs ${right.village_name}` : "Select two villages to compare"}
            </span>
          </div>
        </div>

        <div className="scalgo-topbar-tools" role="toolbar" aria-label="Comparison tools">
          <button
            type="button"
            className="scalgo-tool-btn"
            disabled={chosen.length < 2}
            onClick={swapPair}
            title="Swap Left and Right village maps"
          >
            <ArrowLeftRight size={16} />
            <span>Swap</span>
          </button>

          <button
            type="button"
            className={`scalgo-tool-btn ${syncZoom ? "active" : ""}`}
            onClick={() => setSyncZoom((s) => !s)}
            title="Keep both maps at the same zoom scale"
          >
            <Link2 size={16} />
            <span>Sync Zoom</span>
          </button>

          <button
            type="button"
            className={`scalgo-tool-btn ${rightOpen && rightTab === "chart" ? "active" : ""}`}
            onClick={() => openRightTab("chart")}
            title="View Comparison Charts"
          >
            <BarChart3 size={16} />
            <span>Charts</span>
          </button>

          <button
            type="button"
            className={`scalgo-tool-btn ${rightOpen && rightTab === "matrix" ? "active" : ""}`}
            onClick={() => openRightTab("matrix")}
            title="View Comparative Data Matrix"
          >
            <Table2 size={16} />
            <span>Data Matrix</span>
          </button>
        </div>

        <div className="scalgo-topbar-right">
          <button
            type="button"
            className="scalgo-tool-btn"
            onClick={resetAll}
            title="Reset comparison settings"
          >
            <RotateCcw size={15} />
            <span>Reset</span>
          </button>
          <button
            type="button"
            className={`scalgo-tool-btn ${showHelp ? "active" : ""}`}
            onClick={() => setShowHelp((h) => !h)}
            title="Comparison guide"
          >
            <HelpCircle size={15} />
            <span>Help</span>
          </button>
        </div>
      </header>

      {showHelp && (
        <div className="scalgo-help-banner">
          <span>
            <b>Side-by-Side Comparison:</b> Choose two different villages in the <b>Left Panel</b> to inspect their separate <b>Left Map</b> and <b>Right Map</b> side by side, and view charts &amp; the full 16-metric matrix in the <b>Right Panel</b>.
          </span>
          <button type="button" onClick={() => setShowHelp(false)} aria-label="Dismiss help">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 3-Pane Split Workspace */}
      <div className="scalgo-body">
        {/* LEFT PANEL: Location, Map Pair & Layer Controls */}
        <aside className={`scalgo-panel left ${leftOpen ? "open" : "collapsed"}`} aria-label="Comparison Controls">
          {leftOpen && (
            <div className="scalgo-panel-inner">
              <div className="scalgo-panel-title-bar">
                <span>Comparison Controls</span>
              </div>

              <div className="scalgo-panel-scroll">
                {/* Accordion 1: Area Filter */}
                <div className="scalgo-section">
                  <button
                    type="button"
                    className="scalgo-section-head"
                    onClick={() => toggleSection("location")}
                    aria-expanded={openSections.location}
                  >
                    {openSections.location ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span>Location Filter</span>
                  </button>
                  {openSections.location && (
                    <div className="scalgo-section-body">
                      <label className="scalgo-field">
                        <span>State</span>
                        <select value={stateCode ?? ""} onChange={(e) => setStateCode(e.target.value ? Number(e.target.value) : null)}>
                          <option value="" disabled>Select state…</option>
                          {states.map((s) => (
                            <option key={s.state_code} value={s.state_code}>{s.state_name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="scalgo-field">
                        <span>District</span>
                        <select
                          value={districtCode ?? ""}
                          disabled={!stateCode}
                          onChange={(e) => setDistrictCode(e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="" disabled>Select district…</option>
                          {districts.map((d) => (
                            <option key={d.district_code} value={d.district_code}>{d.district_name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="scalgo-field">
                        <span>Sub-district / Block</span>
                        <select
                          value={subdistrictCode ?? ""}
                          disabled={!districtCode}
                          onChange={(e) => setSubdistrictCode(e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">All sub-districts</option>
                          {subdistricts.map((s) => (
                            <option key={s.subdistrict_code} value={s.subdistrict_code}>{s.subdistrict_name}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </div>

                {/* Accordion 2: Left & Right Village Pickers */}
                <div className="scalgo-section">
                  <button
                    type="button"
                    className="scalgo-section-head"
                    onClick={() => toggleSection("villages")}
                    aria-expanded={openSections.villages}
                  >
                    {openSections.villages ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span>Left &amp; Right Villages</span>
                  </button>
                  {openSections.villages && (
                    <div className="scalgo-section-body">
                      <label className="scalgo-field">
                        <span>Left Map Village</span>
                        <select
                          value={left?.village_code ?? ""}
                          onChange={(e) => e.target.value && setSlot(0, e.target.value)}
                        >
                          <option value="" disabled>Choose left village…</option>
                          {pool.map((v) => (
                            <option key={v.village_code} value={v.village_code}>
                              {villageLabel(v, showCodes)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="scalgo-field">
                        <span>Right Map Village</span>
                        <select
                          value={right?.village_code ?? ""}
                          onChange={(e) => e.target.value && setSlot(1, e.target.value)}
                        >
                          <option value="" disabled>Choose right village…</option>
                          {pool.map((v) => (
                            <option key={v.village_code} value={v.village_code}>
                              {villageLabel(v, showCodes)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        type="button"
                        className="scalgo-action-btn"
                        disabled={chosen.length < 2}
                        onClick={swapPair}
                      >
                        <ArrowLeftRight size={13} />
                        <span>Swap Left &amp; Right</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Accordion 3: Map Layer & Basemap */}
                <div className="scalgo-section">
                  <button
                    type="button"
                    className="scalgo-section-head"
                    onClick={() => toggleSection("layer")}
                    aria-expanded={openSections.layer}
                  >
                    {openSections.layer ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span>Map Layer &amp; Base Map</span>
                  </button>
                  {openSections.layer && (
                    <div className="scalgo-section-body">
                      <label className="scalgo-field">
                        <span>Overlay Layer</span>
                        <select value={layer} onChange={(e) => setLayer(e.target.value as SwipeLayer)}>
                          {LAYERS.map((l) => (
                            <option key={l.key} value={l.key}>{l.label}</option>
                          ))}
                        </select>
                      </label>

                      <div className="scalgo-field">
                        <span>Base Map</span>
                        <label className={`scalgo-radio ${basemap === "streets" ? "checked" : ""}`}>
                          <input type="radio" name="compare-bm" checked={basemap === "streets"} onChange={() => setBasemap("streets")} />
                          <span className="scalgo-radio-dot" aria-hidden />
                          <span>Streets &amp; Places</span>
                        </label>
                        <label className={`scalgo-radio ${basemap === "satellite" ? "checked" : ""}`}>
                          <input type="radio" name="compare-bm" checked={basemap === "satellite"} onChange={() => setBasemap("satellite")} />
                          <span className="scalgo-radio-dot" aria-hidden />
                          <span>Satellite Imagery</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Accordion 4: Multi-Village Matrix List (2-5) */}
                <div className="scalgo-section">
                  <button
                    type="button"
                    className="scalgo-section-head"
                    onClick={() => toggleSection("multi")}
                    aria-expanded={openSections.multi}
                  >
                    {openSections.multi ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span>Multi-Village ({chosen.length}/{MAX_VILLAGES})</span>
                  </button>
                  {openSections.multi && (
                    <div className="scalgo-section-body">
                      <div className="scalgo-compare-combo">
                        <VillageCombobox
                          villages={available}
                          value={null}
                          onChange={(code) => setCodes([...codes, code])}
                          label={`Add village (${codes.length} of ${MAX_VILLAGES})`}
                          placeholder={codes.length >= MAX_VILLAGES ? "Max 5 selected" : "Search to add…"}
                          showCodes={showCodes}
                          clearOnSelect
                          disabled={codes.length >= MAX_VILLAGES}
                        />
                      </div>
                      <div className="scalgo-chip-list">
                        {chosen.map((v, i) => (
                          <span key={v.village_code} className="chip">
                            <span>{i === 0 ? "L: " : i === 1 ? "R: " : ""}{v.village_name}</span>
                            <button
                              type="button"
                              onClick={() => setCodes(codes.filter((c) => c !== v.village_code))}
                              aria-label={`Remove ${v.village_name}`}
                            >
                              <X size={13} />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="scalgo-panel-foot">
                <span>{chosen.length} villages in comparison</span>
              </div>
            </div>
          )}

          <button
            type="button"
            className="scalgo-collapse-btn right"
            onClick={() => setLeftOpen((o) => !o)}
            aria-label={leftOpen ? "Collapse left panel" : "Expand left panel"}
            title={leftOpen ? "Hide Controls" : "Show Controls"}
          >
            {leftOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
        </aside>

        {/* CENTER STAGE: Two Separate Maps Side-by-Side */}
        <main className="scalgo-compare-stage">
          {left && right ? (
            <>
              <div className="scalgo-dual-maps-wrap">
                <DualMaps
                  left={left}
                  right={right}
                  layer={layer}
                  basemap={basemap}
                  syncZoom={syncZoom}
                  layoutTick={layoutTick}
                />
              </div>
              {(layer === "landcover" || legend.length > 0) && (
                <div className="scalgo-compare-legend">
                  {layer === "landcover"
                    ? LANDCOVER_LEGEND.map(([label, color]) => (
                        <span key={label}><i style={{ background: color }} />{label}</span>
                      ))
                    : legend.map((l) => (
                        <span key={l.label}><i style={{ background: l.color }} />{l.label.replace("&lt;", "<").replace("&gt;", ">")}</span>
                      ))}
                </div>
              )}
            </>
          ) : (
            <div className="scalgo-empty-inspector">
              <p>Select at least two villages in the Left Panel to display the Left and Right village maps side by side.</p>
            </div>
          )}
        </main>

        {/* RIGHT PANEL: Charts & Comparative Data Matrix */}
        <aside className={`scalgo-panel right scalgo-compare-right ${rightOpen ? "open" : "collapsed"}`} aria-label="Comparison Analytics">
          <button
            type="button"
            className="scalgo-collapse-btn left"
            onClick={() => setRightOpen((o) => !o)}
            aria-label={rightOpen ? "Collapse right panel" : "Expand right panel"}
            title={rightOpen ? "Hide Analytics" : "Show Analytics"}
          >
            {rightOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          {rightOpen && (
            <div className="scalgo-panel-inner">
              <div className="scalgo-panel-tabs">
                <button
                  type="button"
                  className={`scalgo-tab ${rightTab === "chart" ? "active" : ""}`}
                  onClick={() => setRightTab("chart")}
                >
                  Charts
                </button>
                <button
                  type="button"
                  className={`scalgo-tab ${rightTab === "matrix" ? "active" : ""}`}
                  onClick={() => setRightTab("matrix")}
                >
                  Data Matrix ({chosen.length})
                </button>
              </div>

              {chosen.length >= 2 ? (
                rightTab === "chart" ? (
                  <div className="scalgo-inspector-scroll">
                    {left && right && (
                      <div className="scalgo-inspector-card">
                        <h4>{left.village_name} vs {right.village_name}</h4>
                        <div className="scalgo-kpi-grid">
                          <div className="scalgo-kpi-tile">
                            <span>{left.village_name}</span>
                            <b>{fmt(left.total_co2e_t_yr, 1)} t/yr</b>
                          </div>
                          <div className="scalgo-kpi-tile">
                            <span>{right.village_name}</span>
                            <b>{fmt(right.total_co2e_t_yr, 1)} t/yr</b>
                          </div>
                          <div className="scalgo-kpi-tile">
                            <span>Per Capita (Left)</span>
                            <b>{fmt(left.per_capita_co2e_kg_yr, 0)} kg</b>
                          </div>
                          <div className="scalgo-kpi-tile">
                            <span>Per Capita (Right)</span>
                            <b>{fmt(right.per_capita_co2e_kg_yr, 0)} kg</b>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="scalgo-inspector-card">
                      <h4>Total Carbon Footprint (t CO₂e/yr)</h4>
                      <SimpleBarChart
                        data={chosen.map((v) => ({ village: v.village_name, total: v.total_co2e_t_yr }))}
                        category="village"
                        series={[{ key: "total", name: "t CO₂e/yr" }]}
                        rowColors={QUALITATIVE}
                        height={240}
                      />
                    </div>

                    {left && right && (
                      <div className="scalgo-inspector-card">
                        <h4>Sectoral Comparison (Left vs Right)</h4>
                        <div className="scalgo-sector-bars">
                          {sectorCompare.map((s) => (
                            <div key={s.label} className="scalgo-sector-row">
                              <div className="scalgo-sector-labels">
                                <span><b>{s.label}</b></span>
                                <span>{fmt(s.a, 1)} t vs {fmt(s.b, 1)} t</span>
                              </div>
                              <div className="scalgo-sector-track">
                                <div className="scalgo-sector-fill" style={{ width: `${s.pctA}%`, background: "#1b5e20" }} />
                              </div>
                              <div className="scalgo-sector-track" style={{ marginTop: 3 }}>
                                <div className="scalgo-sector-fill" style={{ width: `${s.pctB}%`, background: "#0284c7" }} />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="scalgo-dual-legend-inline">
                          <span><i style={{ background: "#1b5e20" }} />{left.village_name}</span>
                          <span><i style={{ background: "#0284c7" }} />{right.village_name}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="scalgo-rank-table-wrap">
                    <table className="scalgo-rank-table scalgo-matrix-table">
                      <thead>
                        <tr>
                          <th>Metric</th>
                          {chosen.map((v) => (
                            <th key={v.village_code} className="num">{v.village_name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {MATRIX.map((m) => (
                          <tr key={m.key} className="scalgo-rank-row">
                            <td><b>{m.label}</b></td>
                            {chosen.map((v) => (
                              <td key={v.village_code} className="num">
                                {m.decimals !== undefined ? fmt(v[m.key] as number | null, m.decimals) : String(v[m.key] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <div className="scalgo-empty-inspector">
                  <p>Select at least 2 villages to view the comparison chart and comparative matrix.</p>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
