"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Crosshair,
  FileText,
  FlaskConical,
  HelpCircle,
  Layers,
  Leaf,
  MapPin,
  RotateCcw,
  Scale,
  Search,
  Trophy,
  X,
} from "lucide-react";
import { DonutChart } from "@/components/charts";
import { useDashboard } from "@/components/DashboardContext";
import { SECTORS } from "@/components/nav";
import { CensusCode } from "@/components/VillageSelector";
import { BASE_MAPS, THEMATIC_METRICS, type BaseMapId } from "@/components/VillageMap";
import { useRasterLayers } from "@/lib/api";
import { SCALES, scaleColors } from "@/lib/colors";
import { fmt, mean, num } from "@/lib/format";
import type { NumericKey, Village } from "@/lib/types";

// Leaflet needs the browser window, so the map is client-only.
const VillageMap = dynamic(() => import("@/components/VillageMap"), {
  ssr: false,
  loading: () => <div className="loading">Rendering GIS Map with Village Polygons…</div>,
});

type RightTab = "overview" | "carbon" | "ranking" | "sectors";

const RANK_RAMPS = {
  reds: ["#67000d", "#a50f15", "#d7301f", "#fc4e2a", "#fd8d3c", "#fecc5c", "#ffffcc"],
  purples: ["#3f007d", "#54278f", "#6a51a3", "#807dba", "#9e9ac8", "#cbc9e2", "#f2f0f7"],
  greens: ["#00441b", "#006d2c", "#238b45", "#41ab5d", "#74c476", "#a1d99b", "#e5f5e0"],
  blues: ["#08306b", "#08519c", "#2171b5", "#4292c6", "#6baed6", "#9ecae1", "#deebf7"],
  browns: ["#4a1d00", "#7f2704", "#a63603", "#d94801", "#f16913", "#fdae6b", "#fee6ce"],
};

const RANK_METRICS: { label: string; col: NumericKey; decimals: number; unit: string; ramp: keyof typeof RANK_RAMPS }[] = [
  { label: "Total Carbon Emission", col: "total_co2e_t_yr", decimals: 1, unit: "t CO₂e/yr", ramp: "reds" },
  { label: "Per Capita Carbon", col: "per_capita_co2e_kg_yr", decimals: 1, unit: "kg CO₂e/yr", ramp: "reds" },
  { label: "Total Population", col: "total_residents", decimals: 0, unit: "residents", ramp: "purples" },
  { label: "Agricultural Land Area", col: "agri_area_ha", decimals: 1, unit: "ha", ramp: "greens" },
  { label: "Electricity Consumption", col: "electricity_monthly_kwh", decimals: 0, unit: "kWh/mo", ramp: "blues" },
  { label: "Solid Waste Generation", col: "waste_monthly_kg", decimals: 0, unit: "kg/mo", ramp: "browns" },
  { label: "Total Livestock Count", col: "total_livestock", decimals: 0, unit: "head", ramp: "browns" },
];

const TABLE_ROWS = [25, 50, 100, 0];
const BAND_ENDS = [10, 25, 50, 100, 250, 500];

type RankedVillage = Village & { rank: number; value: number };

function computeRankBands(n: number, ramp: string[]) {
  const ends = [...BAND_ENDS.filter((e) => e < n), n];
  return ends.map((to, i) => {
    const from = i ? ends[i - 1] + 1 : 1;
    return {
      from,
      to,
      color: ramp[Math.round((i * (ramp.length - 1)) / Math.max(ends.length - 1, 1))],
      label: from === to ? `${from}` : `${from}–${to}`,
    };
  });
}

export default function MapPage() {
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
    areaLabel,
    placeOptions,
    selectedCode,
    setSelectedCode,
    activeVillage: v,
    showCodes,
  } = useDashboard();

  const { data: rasters = [] } = useRasterLayers();

  // Workbench UI state
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftTab, setLeftTab] = useState<"layers" | "villages">("layers");
  const [rightTab, setRightTab] = useState<RightTab>("overview");
  const [sectorKey, setSectorKey] = useState<string>(SECTORS[0].key);
  const [villageQuery, setVillageQuery] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  // Support deep links like /map?tab=carbon, /map?tab=ranking, /map?tab=sectors&s=energy
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const sec = params.get("s");
    if (tab === "carbon" || tab === "ranking" || tab === "sectors" || tab === "overview") {
      setRightTab(tab);
      setRightOpen(true);
    }
    if (sec && SECTORS.some((x) => x.key === sec)) {
      setSectorKey(sec);
    }
  }, []);

  // Accordion open state in left panel
  const [openSections, setOpenSections] = useState({
    location: true,
    boundaries: true,
    rasters: false,
    basemap: true,
  });

  // Map layer controls
  const [metricIdx, setMetricIdx] = useState(0);
  const [baseMap, setBaseMap] = useState<BaseMapId>("topo");
  const [showDistrictBoundary, setShowDistrictBoundary] = useState(true);
  const [showBlockBoundaries, setShowBlockBoundaries] = useState(true);
  const [showVillages, setShowVillages] = useState(true);
  const [activeRasters, setActiveRasters] = useState<string[]>([]);

  // Ranking state inside right panel
  const [rankMetricIdx, setRankMetricIdx] = useState(0);
  const [rankAscending, setRankAscending] = useState(false);
  const [rankRowsLimit, setRankRowsLimit] = useState(50);
  const rankTableRef = useRef<HTMLDivElement>(null);

  // Trigger map zoom/resize actions from toolbar & side panels
  const [zoomRequest, setZoomRequest] = useState<{ target: "district" | "village"; seq: number } | null>(null);

  const areaFilter = useMemo(
    () => (subdistrictCode ? { label: areaLabel, codes: new Set(filteredVillages.map((x) => x.village_code)) } : null),
    [subdistrictCode, areaLabel, filteredVillages]
  );

  // Villages shown inside left panel search/list
  const listedVillages = useMemo(() => {
    const q = villageQuery.trim().toLowerCase();
    const base = filteredVillages.length ? filteredVillages : allVillages;
    if (!q) return base;
    return base.filter(
      (item) =>
        item.village_name.toLowerCase().includes(q) ||
        item.block_name.toLowerCase().includes(q) ||
        (showCodes && item.village_code.toLowerCase().includes(q))
    );
  }, [filteredVillages, allVillages, villageQuery, showCodes]);

  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleRaster = (layer: string) =>
    setActiveRasters((prev) => (prev.includes(layer) ? prev.filter((x) => x !== layer) : [...prev, layer]));

  const openRightTab = (tab: RightTab) => {
    setRightTab(tab);
    setRightOpen(true);
  };

  const resetWorkbench = () => {
    setSubdistrictCode(null);
    setVillageQuery("");
    setMetricIdx(0);
    setBaseMap("topo");
    setShowDistrictBoundary(true);
    setShowBlockBoundaries(true);
    setShowVillages(true);
    setActiveRasters([]);
    setRankMetricIdx(0);
    setRankAscending(false);
    setZoomRequest((prev) => ({ target: "district", seq: (prev?.seq ?? 0) + 1 }));
  };

  // Overview sectoral bars
  const sectors = useMemo(() => {
    if (!v) return [];
    const total = Math.max(num(v.total_co2e_t_yr), 0.001);
    return [
      { label: "Energy", val: num(v.energy_total_co2e_t_yr), color: "#f59e0b" },
      { label: "Transport", val: num(v.transport_co2e_t_yr), color: "#0284c7" },
      { label: "Waste", val: num(v.waste_co2e_t_yr), color: "#dc2626" },
      { label: "Livestock", val: num(v.livestock_co2e_t_yr), color: "#16a34a" },
    ].map((s) => ({ ...s, pct: Math.min(100, Math.round((s.val / total) * 100)) }));
  }, [v]);

  // Detailed 6-source Carbon Emission breakdown (from /carbon)
  const carbonSources = useMemo(() => {
    if (!v) return [];
    const items = [
      { sector: "LPG Combustion", value: num(v.lpg_co2e_t_yr) },
      { sector: "Firewood Biomass Burning", value: num(v.firewood_co2e_t_yr) },
      { sector: "Grid Electricity Consumption", value: num(v.electricity_co2e_t_yr) },
      { sector: "Motorbike Petrol Transport", value: num(v.transport_co2e_t_yr) },
      { sector: "Solid Waste Disposal", value: num(v.waste_co2e_t_yr) },
      { sector: "Livestock Enteric Fermentation", value: num(v.livestock_co2e_t_yr) },
    ];
    const colors = scaleColors(items.map((s) => s.value), SCALES.reds);
    const total = Math.max(items.reduce((sum, s) => sum + s.value, 0), 0.001);
    const maxVal = Math.max(...items.map((s) => s.value), 0.001);
    return items.map((s, idx) => ({
      ...s,
      color: colors[idx],
      pctTotal: ((s.value / total) * 100).toFixed(1),
      pctBar: Math.round((s.value / maxVal) * 100),
    }));
  }, [v]);

  // Village Ranking calculations (from /ranking)
  const rankMetric = RANK_METRICS[rankMetricIdx];
  const rankedVillages = useMemo<RankedVillage[]>(() => {
    const pool = filteredVillages.length ? filteredVillages : allVillages;
    return pool
      .filter((item) => item[rankMetric.col] != null)
      .map((item) => ({ ...item, value: Number(item[rankMetric.col]), rank: 0 }))
      .sort((a, b) => (rankAscending ? a.value - b.value : b.value - a.value) || a.village_name.localeCompare(b.village_name))
      .map((item, idx) => ({ ...item, rank: idx + 1 }));
  }, [filteredVillages, allVillages, rankMetric, rankAscending]);

  const rankBands = useMemo(
    () => computeRankBands(rankedVillages.length, RANK_RAMPS[rankMetric.ramp]),
    [rankedVillages.length, rankMetric.ramp]
  );

  const selectedRanked = rankedVillages.find((item) => item.village_code === selectedCode);
  const shownRankedRows = rankRowsLimit ? rankedVillages.slice(0, rankRowsLimit) : rankedVillages;
  const extraRanked = selectedRanked && !shownRankedRows.includes(selectedRanked) ? selectedRanked : null;

  const rankBadgeStyle = (rank: number) => {
    const idx = rankBands.findIndex((b) => rank >= b.from && rank <= b.to);
    return {
      background: rankBands[idx]?.color ?? "#cfd8dc",
      color: idx >= 0 && idx < Math.ceil(rankBands.length * 0.6) ? "#fff" : "#263238",
    };
  };

  // Sync map thematic layer when user chooses a matching metric in Village Ranking
  const handleRankMetricChange = (idx: number) => {
    setRankMetricIdx(idx);
    const col = RANK_METRICS[idx].col;
    const matchIdx = THEMATIC_METRICS.findIndex((m) => m.col === col);
    if (matchIdx >= 0) setMetricIdx(matchIdx);
  };

  useEffect(() => {
    if (rightTab !== "ranking") return;
    rankTableRef.current?.querySelector(".scalgo-rank-row.selected")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedCode, rightTab]);

  const layoutTick = (leftOpen ? 1 : 0) + (rightOpen ? 2 : 0);

  return (
    <div className="scalgo-workbench">
      {/* Top Dark Forest-Green GIS Workbench Bar */}
      <header className="scalgo-topbar">
        <div className="scalgo-topbar-left">
          <span className="scalgo-brand-dot" aria-hidden />
          <div className="scalgo-brand-text">
            <span className="scalgo-brand-title">Varanasi GIS Workbench</span>
            <span className="scalgo-brand-sub">
              {areaLabel || "Varanasi District"}
              {v ? ` · ${v.village_name}` : ""}
            </span>
          </div>
        </div>

        <div className="scalgo-topbar-tools" role="toolbar" aria-label="Map tools">
          <button
            type="button"
            className="scalgo-tool-btn"
            onClick={() => setZoomRequest((p) => ({ target: "district", seq: (p?.seq ?? 0) + 1 }))}
            title="Zoom to Varanasi District"
          >
            <Compass size={16} />
            <span>District</span>
          </button>

          <button
            type="button"
            className="scalgo-tool-btn"
            disabled={!v}
            onClick={() => setZoomRequest((p) => ({ target: "village", seq: (p?.seq ?? 0) + 1 }))}
            title="Zoom to selected village"
          >
            <Crosshair size={16} />
            <span>Focus Village</span>
          </button>

          <button
            type="button"
            className={`scalgo-tool-btn ${rightOpen && rightTab === "overview" ? "active" : ""}`}
            onClick={() => openRightTab("overview")}
            title="Open Village Inspector"
          >
            <MapPin size={16} />
            <span>Inspector</span>
          </button>

          <button
            type="button"
            className={`scalgo-tool-btn ${rightOpen && rightTab === "carbon" ? "active" : ""}`}
            onClick={() => openRightTab("carbon")}
            title="Open Carbon Emission Modeling"
          >
            <Leaf size={16} />
            <span>Carbon</span>
          </button>

          <button
            type="button"
            className={`scalgo-tool-btn ${rightOpen && rightTab === "ranking" ? "active" : ""}`}
            onClick={() => openRightTab("ranking")}
            title="Open Village Ranking"
          >
            <Trophy size={16} />
            <span>Ranking</span>
          </button>

          <button
            type="button"
            className={`scalgo-tool-btn ${rightOpen && rightTab === "sectors" ? "active" : ""}`}
            onClick={() => openRightTab("sectors")}
            title="Open Sectoral Activity Data"
          >
            <Layers size={16} />
            <span>Sectors</span>
          </button>
        </div>

        <div className="scalgo-topbar-right">
          <button
            type="button"
            className="scalgo-tool-btn"
            onClick={resetWorkbench}
            title="Reset map filters and layers"
          >
            <RotateCcw size={15} />
            <span>Reset</span>
          </button>
          <button
            type="button"
            className={`scalgo-tool-btn ${showHelp ? "active" : ""}`}
            onClick={() => setShowHelp((h) => !h)}
            title="Map usage tips"
          >
            <HelpCircle size={15} />
            <span>Help</span>
          </button>
        </div>
      </header>

      {showHelp && (
        <div className="scalgo-help-banner">
          <span>
            <b>Quick Tips:</b> Use the <b>Left Panel</b> for Location, GIS boundaries, rasters &amp; base maps.
            Switch the <b>Thematic Map Layer</b> dropdown on the top-right of the map, or use the <b>Right Panel</b> tabs for <b>Overview</b>, <b>Carbon Emission</b>, and <b>Village Ranking</b>. Press <b>F</b> for fullscreen.
          </span>
          <button type="button" onClick={() => setShowHelp(false)} aria-label="Dismiss help">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 3-Pane Split Workspace */}
      <div className="scalgo-body">
        {/* LEFT PANEL: Location & Layers */}
        <aside className={`scalgo-panel left ${leftOpen ? "open" : "collapsed"}`} aria-label="Locations and Layers">
          {leftOpen && (
            <div className="scalgo-panel-inner">
              <div className="scalgo-panel-tabs">
                <button
                  type="button"
                  className={`scalgo-tab ${leftTab === "layers" ? "active" : ""}`}
                  onClick={() => setLeftTab("layers")}
                >
                  Location &amp; Layers
                </button>
                <button
                  type="button"
                  className={`scalgo-tab ${leftTab === "villages" ? "active" : ""}`}
                  onClick={() => setLeftTab("villages")}
                >
                  Villages ({listedVillages.length})
                </button>
              </div>

              {leftTab === "layers" ? (
                <div className="scalgo-panel-scroll">
                  {/* Accordion 1: Location Selector */}
                  <div className="scalgo-section">
                    <button
                      type="button"
                      className="scalgo-section-head"
                      onClick={() => toggleSection("location")}
                      aria-expanded={openSections.location}
                    >
                      {openSections.location ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span>Location</span>
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

                        <label className="scalgo-field">
                          <span>Selected Village</span>
                          <select
                            value={selectedCode ?? ""}
                            disabled={!placeOptions.length}
                            onChange={(e) => e.target.value && setSelectedCode(e.target.value)}
                          >
                            <option value="" disabled>Select village…</option>
                            {placeOptions.map((p) => (
                              <option key={p.village_code} value={p.village_code}>
                                {p.village_name}{p.survey ? "" : " (No survey)"}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Accordion 2: GIS Boundaries */}
                  <div className="scalgo-section">
                    <button
                      type="button"
                      className="scalgo-section-head"
                      onClick={() => toggleSection("boundaries")}
                      aria-expanded={openSections.boundaries}
                    >
                      {openSections.boundaries ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span>GIS Boundaries</span>
                    </button>
                    {openSections.boundaries && (
                      <div className="scalgo-section-body">
                        <label className="scalgo-check">
                          <input
                            type="checkbox"
                            checked={showDistrictBoundary}
                            onChange={(e) => setShowDistrictBoundary(e.target.checked)}
                          />
                          <span>District Boundary</span>
                        </label>
                        <label className="scalgo-check">
                          <input
                            type="checkbox"
                            checked={showBlockBoundaries}
                            onChange={(e) => setShowBlockBoundaries(e.target.checked)}
                          />
                          <span>Block Boundaries</span>
                        </label>
                        <label className="scalgo-check">
                          <input
                            type="checkbox"
                            checked={showVillages}
                            onChange={(e) => setShowVillages(e.target.checked)}
                          />
                          <span>Village Polygons ({filteredVillages.length})</span>
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Accordion 3: Raster Overlays */}
                  <div className="scalgo-section">
                    <button
                      type="button"
                      className="scalgo-section-head"
                      onClick={() => toggleSection("rasters")}
                      aria-expanded={openSections.rasters}
                    >
                      {openSections.rasters ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span>Raster Layers ({rasters.length})</span>
                    </button>
                    {openSections.rasters && (
                      <div className="scalgo-section-body">
                        <div className="scalgo-muted-note">
                          Clipped to: <b>{areaLabel || "Varanasi District"}</b>
                        </div>
                        {rasters.length === 0 ? (
                          <div className="scalgo-muted-note">No raster layers available.</div>
                        ) : (
                          rasters.map((r) => (
                            <label key={r.layer} className="scalgo-check">
                              <input
                                type="checkbox"
                                checked={activeRasters.includes(r.layer)}
                                onChange={() => toggleRaster(r.layer)}
                              />
                              <span>{r.title}</span>
                            </label>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Accordion 4: Base Map */}
                  <div className="scalgo-section">
                    <button
                      type="button"
                      className="scalgo-section-head"
                      onClick={() => toggleSection("basemap")}
                      aria-expanded={openSections.basemap}
                    >
                      {openSections.basemap ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span>Base Map</span>
                    </button>
                    {openSections.basemap && (
                      <div className="scalgo-section-body">
                        {BASE_MAPS.map((b) => (
                          <label key={b.id} className={`scalgo-radio ${baseMap === b.id ? "checked" : ""}`}>
                            <input
                              type="radio"
                              name="scalgo-basemap"
                              checked={baseMap === b.id}
                              onChange={() => setBaseMap(b.id)}
                            />
                            <span className="scalgo-radio-dot" aria-hidden />
                            <span>{b.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="scalgo-villages-pane">
                  <div className="scalgo-search-wrap">
                    <Search size={14} className="scalgo-search-icon" />
                    <input
                      type="text"
                      placeholder="Filter villages by name or block…"
                      value={villageQuery}
                      onChange={(e) => setVillageQuery(e.target.value)}
                    />
                    {villageQuery && (
                      <button type="button" onClick={() => setVillageQuery("")} aria-label="Clear search">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <div className="scalgo-village-list">
                    {listedVillages.map((item) => {
                      const active = item.village_code === selectedCode;
                      return (
                        <button
                          key={item.village_code}
                          type="button"
                          className={`scalgo-village-row ${active ? "active" : ""}`}
                          onClick={() => setSelectedCode(item.village_code)}
                        >
                          <div className="scalgo-vrow-main">
                            <span className="scalgo-vrow-name">{item.village_name}</span>
                            <span className="scalgo-vrow-sub">{item.block_name}</span>
                          </div>
                          <span className="scalgo-vrow-val">{fmt(item.total_co2e_t_yr, 0)} t</span>
                        </button>
                      );
                    })}
                    {listedVillages.length === 0 && (
                      <div className="scalgo-muted-note">No villages match your filter.</div>
                    )}
                  </div>
                </div>
              )}

              <div className="scalgo-panel-foot">
                <Layers size={14} />
                <span>
                  {filteredVillages.length} villages · {activeRasters.length} raster{activeRasters.length === 1 ? "" : "s"} active
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            className="scalgo-collapse-btn right"
            onClick={() => setLeftOpen((o) => !o)}
            aria-label={leftOpen ? "Collapse left panel" : "Expand left panel"}
            title={leftOpen ? "Hide Location & Layers" : "Show Location & Layers"}
          >
            {leftOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
        </aside>

        {/* CENTER MAP STAGE */}
        <main className="scalgo-map-stage">
          <VillageMap
            villages={allVillages}
            selectedCode={selectedCode}
            areaFilter={areaFilter}
            metricIdx={metricIdx}
            onMetricChange={setMetricIdx}
            onSelect={setSelectedCode}
            baseMap={baseMap}
            showDistrictBoundary={showDistrictBoundary}
            showBlockBoundaries={showBlockBoundaries}
            showVillages={showVillages}
            activeRasters={activeRasters}
            rasters={rasters}
            zoomRequest={zoomRequest}
            layoutTick={layoutTick}
          />
        </main>

        {/* RIGHT PANEL: Overview + Carbon Emission + Village Ranking */}
        <aside className={`scalgo-panel right ${rightOpen ? "open" : "collapsed"}`} aria-label="Village Analytics Inspector">
          <button
            type="button"
            className="scalgo-collapse-btn left"
            onClick={() => setRightOpen((o) => !o)}
            aria-label={rightOpen ? "Collapse right panel" : "Expand right panel"}
            title={rightOpen ? "Hide Analytics Panel" : "Show Analytics Panel"}
          >
            {rightOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          {rightOpen && (
            <div className="scalgo-panel-inner">
              {/* Right Panel Mode Tabs */}
              <div className="scalgo-panel-tabs four">
                <button
                  type="button"
                  className={`scalgo-tab ${rightTab === "overview" ? "active" : ""}`}
                  onClick={() => setRightTab("overview")}
                >
                  Overview
                </button>
                <button
                  type="button"
                  className={`scalgo-tab ${rightTab === "carbon" ? "active" : ""}`}
                  onClick={() => setRightTab("carbon")}
                >
                  Carbon
                </button>
                <button
                  type="button"
                  className={`scalgo-tab ${rightTab === "ranking" ? "active" : ""}`}
                  onClick={() => setRightTab("ranking")}
                >
                  Ranking
                </button>
                <button
                  type="button"
                  className={`scalgo-tab ${rightTab === "sectors" ? "active" : ""}`}
                  onClick={() => setRightTab("sectors")}
                >
                  Sectors
                </button>
              </div>

              {/* TAB 1: OVERVIEW */}
              {rightTab === "overview" && (
                v ? (
                  <div className="scalgo-inspector-scroll">
                    <div className="scalgo-inspector-head">
                      <div className="scalgo-inspector-badge">
                        <MapPin size={12} />
                        <span>Selected Village</span>
                      </div>
                      <h3>{v.village_name}</h3>
                      <div className="scalgo-inspector-meta">
                        <span>{v.block_name} Block</span>
                        <CensusCode code={v.village_code} />
                      </div>
                    </div>

                    <div className="scalgo-metric-highlight">
                      <span className="label">{THEMATIC_METRICS[metricIdx].caption}</span>
                      <strong className="val">{fmt(v[THEMATIC_METRICS[metricIdx].col], 1)}</strong>
                    </div>

                    <div className="scalgo-kpi-grid">
                      <div className="scalgo-kpi-tile">
                        <span>Residents</span>
                        <b>{fmt(v.total_residents)}</b>
                      </div>
                      <div className="scalgo-kpi-tile">
                        <span>Total Area</span>
                        <b>{fmt(v.total_area_ha, 1)} ha</b>
                      </div>
                      <div className="scalgo-kpi-tile">
                        <span>Emissions</span>
                        <b>{fmt(v.total_co2e_t_yr, 1)} t/yr</b>
                      </div>
                      <div className="scalgo-kpi-tile">
                        <span>Per Capita</span>
                        <b>{fmt(v.per_capita_co2e_kg_yr, 1)} kg/yr</b>
                      </div>
                    </div>

                    <div className="scalgo-inspector-card">
                      <h4>Sectoral CO₂e Breakdown</h4>
                      <div className="scalgo-sector-bars">
                        {sectors.map((s) => (
                          <div key={s.label} className="scalgo-sector-row">
                            <div className="scalgo-sector-labels">
                              <span>{s.label}</span>
                              <span><b>{fmt(s.val, 1)}</b> t ({s.pct}%)</span>
                            </div>
                            <div className="scalgo-sector-track">
                              <div className="scalgo-sector-fill" style={{ width: `${s.pct}%`, background: s.color }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="scalgo-inspector-card">
                      <h4>Land Use Summary</h4>
                      <dl className="scalgo-dl">
                        <div><dt>Built-up</dt><dd>{fmt(v.builtup_area_ha, 1)} ha</dd></div>
                        <div><dt>Agriculture</dt><dd>{fmt(v.agri_area_ha, 1)} ha</dd></div>
                        <div><dt>Water Bodies</dt><dd>{fmt(v.total_water_area_ha, 1)} ha</dd></div>
                        <div><dt>Households</dt><dd>{fmt(v.total_households)}</dd></div>
                      </dl>
                    </div>

                    <div className="scalgo-inspector-actions">
                      <Link href="/visualize" className="scalgo-action-btn primary">
                        <FlaskConical size={14} />
                        <span>Open 3D Carbon Lab</span>
                      </Link>
                      <Link href="/reports" className="scalgo-action-btn">
                        <FileText size={14} />
                        <span>Village Report</span>
                      </Link>
                      <Link href="/comparison" className="scalgo-action-btn">
                        <Scale size={14} />
                        <span>Compare</span>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="scalgo-empty-inspector">
                    <p>
                      Click any village polygon on the map or pick a location from the left panel to inspect emissions and land use.
                    </p>
                    <div className="scalgo-empty-icons" aria-hidden>
                      <span><MapPin size={18} /></span>
                      <span><BarChart3 size={18} /></span>
                      <span><Layers size={18} /></span>
                    </div>
                  </div>
                )
              )}

              {/* TAB 2: CARBON EMISSION */}
              {rightTab === "carbon" && (
                v ? (
                  <div className="scalgo-inspector-scroll">
                    <div className="scalgo-inspector-head">
                      <div className="scalgo-inspector-badge">
                        <Leaf size={12} />
                        <span>IPCC Tier-1 Accounting</span>
                      </div>
                      <h3>{v.village_name}</h3>
                      <div className="scalgo-inspector-meta">
                        <span>{v.block_name} Block</span>
                        <span>Derived Carbon Output</span>
                      </div>
                    </div>

                    <div className="scalgo-kpi-grid">
                      <div className="scalgo-kpi-tile accent-red">
                        <span>Total Footprint</span>
                        <b>{fmt(num(v.total_co2e_t_yr), 2)} t/yr</b>
                      </div>
                      <div className="scalgo-kpi-tile accent-orange">
                        <span>Per Capita</span>
                        <b>{fmt(v.per_capita_co2e_kg_yr, 1)} kg/yr</b>
                      </div>
                      <div className="scalgo-kpi-tile accent-blue">
                        <span>Energy Sector</span>
                        <b>{fmt(num(v.energy_total_co2e_t_yr), 2)} t/yr</b>
                      </div>
                      <div className="scalgo-kpi-tile accent-green">
                        <span>AFOLU &amp; Waste</span>
                        <b>{fmt(num(v.total_co2e_t_yr) - num(v.energy_total_co2e_t_yr), 2)} t/yr</b>
                      </div>
                    </div>

                    <div className="scalgo-inspector-card">
                      <h4>GHG Emissions by Source (t CO₂e/yr)</h4>
                      <div className="scalgo-sector-bars">
                        {carbonSources.map((s) => (
                          <div key={s.sector} className="scalgo-sector-row">
                            <div className="scalgo-sector-labels">
                              <span>{s.sector}</span>
                              <span><b>{fmt(s.value, 2)}</b> t ({s.pctTotal}%)</span>
                            </div>
                            <div className="scalgo-sector-track">
                              <div className="scalgo-sector-fill" style={{ width: `${s.pctBar}%`, background: s.color }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="scalgo-inspector-card">
                      <h4>Sectoral Share</h4>
                      <DonutChart
                        data={carbonSources.map((s) => ({ name: s.sector, value: s.value }))}
                        height={250}
                        decimals={2}
                      />
                    </div>

                    <div className="scalgo-inspector-card">
                      <h4>IPCC Tier-1 Emission Factors</h4>
                      <div className="scalgo-formula-mini">
                        Total GHG = Σ (Annual Activity × Factor) / 1000
                      </div>
                      <ul className="scalgo-factor-list">
                        <li><b>LPG:</b> 2.984 kg CO₂e/kg (IPCC 2006)</li>
                        <li><b>Firewood:</b> 1.747 kg CO₂e/kg (MoEFCC/IPCC)</li>
                        <li><b>Electricity:</b> 0.820 kg CO₂/kWh (CEA India v20.0)</li>
                        <li><b>Transport:</b> 2.310 kg CO₂e/litre (IPCC 2006)</li>
                        <li><b>Solid Waste:</b> 0.450 kg CO₂e/kg (IPCC FOD)</li>
                        <li><b>Livestock:</b> Cattle 980 · Goat/Sheep 145.6 kg/yr</li>
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="scalgo-empty-inspector">
                    <p>
                      Select a surveyed village on the map to inspect its IPCC Tier-1 Greenhouse Gas accounting and sectoral emission breakdown.
                    </p>
                    <div className="scalgo-empty-icons" aria-hidden>
                      <span><Leaf size={18} /></span>
                      <span><BarChart3 size={18} /></span>
                    </div>
                  </div>
                )
              )}

              {/* TAB 3: VILLAGE RANKING */}
              {rightTab === "ranking" && (
                <div className="scalgo-ranking-pane">
                  <div className="scalgo-ranking-controls">
                    <label className="scalgo-field">
                      <span>Ranking Metric</span>
                      <select value={rankMetricIdx} onChange={(e) => handleRankMetricChange(Number(e.target.value))}>
                        {RANK_METRICS.map((m, i) => (
                          <option key={m.col} value={i}>{m.label} ({m.unit})</option>
                        ))}
                      </select>
                    </label>
                    <div className="scalgo-ranking-subrow">
                      <label className="scalgo-field">
                        <span>Rank 1 is</span>
                        <select value={rankAscending ? "low" : "high"} onChange={(e) => setRankAscending(e.target.value === "low")}>
                          <option value="high">Highest</option>
                          <option value="low">Lowest</option>
                        </select>
                      </label>
                      <label className="scalgo-field">
                        <span>Show</span>
                        <select value={rankRowsLimit} onChange={(e) => setRankRowsLimit(Number(e.target.value))}>
                          {TABLE_ROWS.map((n) => (
                            <option key={n} value={n}>{n ? `Top ${n}` : `All (${rankedVillages.length})`}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="scalgo-rank-table-wrap" ref={rankTableRef}>
                    <table className="scalgo-rank-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Village</th>
                          <th className="num">{rankMetric.unit}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shownRankedRows.map((item) => {
                          const isSel = item.village_code === selectedCode;
                          return (
                            <tr
                              key={item.village_code}
                              className={`scalgo-rank-row ${isSel ? "selected" : ""}`}
                              onClick={() => setSelectedCode(item.village_code)}
                            >
                              <td>
                                <span className="scalgo-rank-badge" style={rankBadgeStyle(item.rank)}>
                                  {item.rank}
                                </span>
                              </td>
                              <td>
                                <div className="scalgo-rank-name">{item.village_name}</div>
                                <div className="scalgo-rank-block">
                                  {item.block_name}
                                  {showCodes ? ` · ${item.village_code}` : ""}
                                </div>
                              </td>
                              <td className="num">{fmt(item.value, rankMetric.decimals)}</td>
                            </tr>
                          );
                        })}
                        {extraRanked && (
                          <>
                            <tr className="scalgo-rank-gap"><td colSpan={3}>…</td></tr>
                            <tr
                              className="scalgo-rank-row selected"
                              onClick={() => setSelectedCode(extraRanked.village_code)}
                            >
                              <td>
                                <span className="scalgo-rank-badge" style={rankBadgeStyle(extraRanked.rank)}>
                                  {extraRanked.rank}
                                </span>
                              </td>
                              <td>
                                <div className="scalgo-rank-name">{extraRanked.village_name}</div>
                                <div className="scalgo-rank-block">{extraRanked.block_name}</div>
                              </td>
                              <td className="num">{fmt(extraRanked.value, rankMetric.decimals)}</td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {selectedRanked && (
                    <div className="scalgo-panel-foot rank-foot">
                      <span>
                        <b>{selectedRanked.village_name}</b>: Rank <b>#{selectedRanked.rank}</b> of {rankedVillages.length} ({fmt(selectedRanked.value, rankMetric.decimals)} {rankMetric.unit})
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: SECTORS (Demography, Land & Water, Energy, Transport, Waste, Livestock) */}
              {rightTab === "sectors" && (
                v ? (
                  <div className="scalgo-inspector-scroll">
                    <div className="scalgo-sector-pills" role="tablist" aria-label="Select Sector">
                      {SECTORS.map((s) => {
                        const active = s.key === sectorKey;
                        return (
                          <button
                            key={s.key}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            className={`scalgo-sector-pill ${active ? "active" : ""}`}
                            style={{ "--sector": s.accentColor } as CSSProperties}
                            onClick={() => setSectorKey(s.key)}
                            title={s.hint}
                          >
                            <s.icon size={13} />
                            <span>{s.label === "Waste Management" ? "Waste" : s.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {sectorKey === "demography" && (() => {
                      const area = v.subdistrict ?? v.district;
                      const peers = allVillages.filter((x) => (x.subdistrict ?? x.district) === area);
                      const avgRes = Math.round(mean(peers.map((x) => x.total_residents)));
                      const avgHh = Math.round(mean(peers.map((x) => x.total_households)));
                      const maxRes = Math.max(num(v.total_residents), avgRes, 1);
                      const maxHh = Math.max(num(v.total_households), avgHh, 1);
                      return (
                        <>
                          <div className="scalgo-inspector-head">
                            <div className="scalgo-inspector-badge"><span>Observed Census / Survey</span></div>
                            <h3>{v.village_name} — Demography</h3>
                          </div>
                          <div className="scalgo-kpi-grid">
                            <div className="scalgo-kpi-tile"><span>Total Residents</span><b>{fmt(v.total_residents)}</b></div>
                            <div className="scalgo-kpi-tile"><span>Households</span><b>{fmt(v.total_households)}</b></div>
                            <div className="scalgo-kpi-tile"><span>Male Residents</span><b>{fmt(v.total_male)}</b></div>
                            <div className="scalgo-kpi-tile"><span>Female Residents</span><b>{fmt(v.total_female)}</b></div>
                          </div>
                          <div className="scalgo-inspector-card">
                            <h4>Gender Composition</h4>
                            <DonutChart
                              data={[
                                { name: "Male Residents", value: num(v.total_male) },
                                { name: "Female Residents", value: num(v.total_female) },
                              ]}
                              colors={["#1976d2", "#e91e63"]}
                              height={230}
                              decimals={0}
                            />
                          </div>
                          <div className="scalgo-inspector-card">
                            <h4>Vs {area} Mean</h4>
                            <div className="scalgo-sector-bars">
                              <div className="scalgo-sector-row">
                                <div className="scalgo-sector-labels">
                                  <span>Residents (Village / Mean)</span>
                                  <span><b>{fmt(v.total_residents)}</b> / {fmt(avgRes)}</span>
                                </div>
                                <div className="scalgo-sector-track">
                                  <div className="scalgo-sector-fill" style={{ width: `${Math.round((num(v.total_residents) / maxRes) * 100)}%`, background: "#2e7d32" }} />
                                </div>
                              </div>
                              <div className="scalgo-sector-row">
                                <div className="scalgo-sector-labels">
                                  <span>Households (Village / Mean)</span>
                                  <span><b>{fmt(v.total_households)}</b> / {fmt(avgHh)}</span>
                                </div>
                                <div className="scalgo-sector-track">
                                  <div className="scalgo-sector-fill" style={{ width: `${Math.round((num(v.total_households) / maxHh) * 100)}%`, background: "#7c3aed" }} />
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}

                    {sectorKey === "land-water" && (() => {
                      const land = [
                        { name: "Agricultural", value: num(v.agri_area_ha), color: "#4caf50" },
                        { name: "Built-up", value: num(v.builtup_area_ha), color: "#ff9800" },
                        { name: "Forest", value: num(v.forest_area_ha), color: "#2e7d32" },
                        { name: "Barren", value: num(v.barren_area_ha), color: "#8d6e63" },
                        { name: "Other", value: num(v.remaining_area_ha), color: "#90a4ae" },
                      ].filter((d) => d.value > 0);
                      const water = [
                        { type: "Ponds / Tanks", area: num(v.pond_area_ha), color: "#0288d1" },
                        { type: "Canals / Drainage", area: num(v.canal_area_ha), color: "#0097a7" },
                        { type: "Rivers / Streams", area: num(v.river_area_ha), color: "#00acc1" },
                        { type: "Tube-wells / Wells", area: num(v.well_irrig_area_ha), color: "#26c6da" },
                      ];
                      const maxWater = Math.max(...water.map((w) => w.area), 0.01);
                      return (
                        <>
                          <div className="scalgo-inspector-head">
                            <div className="scalgo-inspector-badge"><span>Observed GIS / Census</span></div>
                            <h3>{v.village_name} — Land &amp; Water</h3>
                          </div>
                          <div className="scalgo-kpi-grid">
                            <div className="scalgo-kpi-tile"><span>Total Area</span><b>{fmt(v.total_area_ha, 2)} ha</b></div>
                            <div className="scalgo-kpi-tile"><span>Agricultural</span><b>{fmt(v.agri_area_ha, 2)} ha</b></div>
                            <div className="scalgo-kpi-tile"><span>Built-up</span><b>{fmt(v.builtup_area_ha, 2)} ha</b></div>
                            <div className="scalgo-kpi-tile"><span>Surface Water</span><b>{fmt(v.total_water_area_ha, 2)} ha</b></div>
                          </div>
                          {land.length > 0 && (
                            <div className="scalgo-inspector-card">
                              <h4>Land Use Distribution</h4>
                              <DonutChart
                                data={land.map((d) => ({ name: d.name, value: d.value }))}
                                colors={land.map((d) => d.color)}
                                height={240}
                                decimals={2}
                              />
                            </div>
                          )}
                          <div className="scalgo-inspector-card">
                            <h4>Water Resources Breakdown (ha)</h4>
                            <div className="scalgo-sector-bars">
                              {water.map((w) => (
                                <div key={w.type} className="scalgo-sector-row">
                                  <div className="scalgo-sector-labels">
                                    <span>{w.type}</span>
                                    <span><b>{fmt(w.area, 2)}</b> ha</span>
                                  </div>
                                  <div className="scalgo-sector-track">
                                    <div className="scalgo-sector-fill" style={{ width: `${Math.round((w.area / maxWater) * 100)}%`, background: w.color }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      );
                    })()}

                    {sectorKey === "energy" && (() => {
                      const area = v.subdistrict ?? v.district;
                      const areaAvg = mean(allVillages.filter((x) => (x.subdistrict ?? x.district) === area).map((x) => x.electricity_monthly_kwh));
                      const maxFuel = Math.max(num(v.lpg_monthly_kg), num(v.firewood_monthly_kg), 1);
                      const maxElec = Math.max(num(v.electricity_monthly_kwh), areaAvg, 1);
                      return (
                        <>
                          <div className="scalgo-inspector-head">
                            <div className="scalgo-inspector-badge"><span>Observed Activity Survey</span></div>
                            <h3>{v.village_name} — Energy</h3>
                          </div>
                          <div className="scalgo-kpi-grid">
                            <div className="scalgo-kpi-tile accent-orange">
                              <span>LPG / month</span>
                              <b>{fmt(v.lpg_monthly_kg, 1)} kg</b>
                            </div>
                            <div className="scalgo-kpi-tile">
                              <span>Firewood / month</span>
                              <b>{fmt(v.firewood_monthly_kg, 1)} kg</b>
                            </div>
                            <div className="scalgo-kpi-tile accent-blue">
                              <span>Electricity / month</span>
                              <b>{fmt(v.electricity_monthly_kwh, 1)} kWh</b>
                            </div>
                            <div className="scalgo-kpi-tile">
                              <span>Annual Grid Use</span>
                              <b>{fmt(num(v.electricity_monthly_kwh) * 12, 0)} kWh</b>
                            </div>
                          </div>
                          <div className="scalgo-inspector-card">
                            <h4>Fuel Volumes (kg/month)</h4>
                            <div className="scalgo-sector-bars">
                              <div className="scalgo-sector-row">
                                <div className="scalgo-sector-labels">
                                  <span>LPG</span>
                                  <span><b>{fmt(v.lpg_monthly_kg, 1)}</b> kg/mo</span>
                                </div>
                                <div className="scalgo-sector-track">
                                  <div className="scalgo-sector-fill" style={{ width: `${Math.round((num(v.lpg_monthly_kg) / maxFuel) * 100)}%`, background: "#f57c00" }} />
                                </div>
                              </div>
                              <div className="scalgo-sector-row">
                                <div className="scalgo-sector-labels">
                                  <span>Firewood / Biomass</span>
                                  <span><b>{fmt(v.firewood_monthly_kg, 1)}</b> kg/mo</span>
                                </div>
                                <div className="scalgo-sector-track">
                                  <div className="scalgo-sector-fill" style={{ width: `${Math.round((num(v.firewood_monthly_kg) / maxFuel) * 100)}%`, background: "#8d6e63" }} />
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="scalgo-inspector-card">
                            <h4>Electricity vs {area} Mean</h4>
                            <div className="scalgo-sector-bars">
                              <div className="scalgo-sector-row">
                                <div className="scalgo-sector-labels">
                                  <span>{v.village_name}</span>
                                  <span><b>{fmt(v.electricity_monthly_kwh, 1)}</b> kWh</span>
                                </div>
                                <div className="scalgo-sector-track">
                                  <div className="scalgo-sector-fill" style={{ width: `${Math.round((num(v.electricity_monthly_kwh) / maxElec) * 100)}%`, background: "#0288d1" }} />
                                </div>
                              </div>
                              <div className="scalgo-sector-row">
                                <div className="scalgo-sector-labels">
                                  <span>{area} Mean</span>
                                  <span><b>{fmt(areaAvg, 1)}</b> kWh</span>
                                </div>
                                <div className="scalgo-sector-track">
                                  <div className="scalgo-sector-fill" style={{ width: `${Math.round((areaAvg / maxElec) * 100)}%`, background: "#78909c" }} />
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}

                    {sectorKey === "transport" && (() => {
                      const households = num(v.total_households);
                      const ratio = households > 0 ? num(v.motorbikes_count) / households : 0;
                      return (
                        <>
                          <div className="scalgo-inspector-head">
                            <div className="scalgo-inspector-badge"><span>Observed Activity Survey</span></div>
                            <h3>{v.village_name} — Transport</h3>
                          </div>
                          <div className="scalgo-kpi-grid">
                            <div className="scalgo-kpi-tile accent-blue">
                              <span>2-Wheelers</span>
                              <b>{fmt(v.motorbikes_count)}</b>
                            </div>
                            <div className="scalgo-kpi-tile">
                              <span>Bikes / Household</span>
                              <b>{ratio.toFixed(2)}</b>
                            </div>
                            <div className="scalgo-kpi-tile">
                              <span>Monthly Petrol</span>
                              <b>{fmt(v.petrol_monthly_litres, 1)} L</b>
                            </div>
                            <div className="scalgo-kpi-tile">
                              <span>Annual Fuel</span>
                              <b>{fmt(num(v.petrol_monthly_litres) * 12, 1)} L/yr</b>
                            </div>
                          </div>
                          <div className="scalgo-inspector-card">
                            <h4>Motorization Insight</h4>
                            <p className="scalgo-muted-note" style={{ margin: 0 }}>
                              <b>{ratio.toFixed(2)}</b> registered motorbikes per household in {v.village_name}, consuming <b>{fmt(num(v.petrol_monthly_litres) * 12, 1)}</b> litres of petrol annually.
                            </p>
                          </div>
                        </>
                      );
                    })()}

                    {sectorKey === "waste" && (() => {
                      const monthly = num(v.waste_monthly_kg);
                      const pop = num(v.total_residents);
                      const perCapitaDaily = pop > 0 ? monthly / pop / 30 : 0;
                      return (
                        <>
                          <div className="scalgo-inspector-head">
                            <div className="scalgo-inspector-badge"><span>Observed Activity Survey</span></div>
                            <h3>{v.village_name} — Solid Waste</h3>
                          </div>
                          <div className="scalgo-kpi-grid">
                            <div className="scalgo-kpi-tile accent-red">
                              <span>Monthly Waste</span>
                              <b>{fmt(monthly, 1)} kg</b>
                            </div>
                            <div className="scalgo-kpi-tile">
                              <span>Annual Waste</span>
                              <b>{fmt((monthly * 12) / 1000, 2)} t/yr</b>
                            </div>
                            <div className="scalgo-kpi-tile">
                              <span>Per Capita / Day</span>
                              <b>{perCapitaDaily.toFixed(3)} kg</b>
                            </div>
                            <div className="scalgo-kpi-tile">
                              <span>Waste Emissions</span>
                              <b>{fmt(v.waste_co2e_t_yr, 2)} t CO₂e/yr</b>
                            </div>
                          </div>
                        </>
                      );
                    })()}

                    {sectorKey === "livestock" && (() => {
                      const animals = [
                        { species: "Dairy Cattle / Cows", count: num(v.cows_count), color: "#4e342e" },
                        { species: "Goats (Caprine)", count: num(v.goats_count), color: "#ffb300" },
                        { species: "Sheep (Ovine)", count: num(v.sheep_count), color: "#8d6e63" },
                      ];
                      const maxCount = Math.max(...animals.map((a) => a.count), 1);
                      return (
                        <>
                          <div className="scalgo-inspector-head">
                            <div className="scalgo-inspector-badge"><span>Observed Livestock Census</span></div>
                            <h3>{v.village_name} — Livestock</h3>
                          </div>
                          <div className="scalgo-kpi-grid">
                            <div className="scalgo-kpi-tile accent-green"><span>Total Livestock</span><b>{fmt(v.total_livestock)}</b></div>
                            <div className="scalgo-kpi-tile"><span>Dairy Cattle</span><b>{fmt(v.cows_count)}</b></div>
                            <div className="scalgo-kpi-tile"><span>Goats</span><b>{fmt(v.goats_count)}</b></div>
                            <div className="scalgo-kpi-tile"><span>Sheep</span><b>{fmt(v.sheep_count)}</b></div>
                          </div>
                          <div className="scalgo-inspector-card">
                            <h4>Herd Composition</h4>
                            <div className="scalgo-sector-bars">
                              {animals.map((a) => (
                                <div key={a.species} className="scalgo-sector-row">
                                  <div className="scalgo-sector-labels">
                                    <span>{a.species}</span>
                                    <span><b>{fmt(a.count)}</b> heads</span>
                                  </div>
                                  <div className="scalgo-sector-track">
                                    <div className="scalgo-sector-fill" style={{ width: `${Math.round((a.count / maxCount) * 100)}%`, background: a.color }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="scalgo-empty-inspector">
                    <p>
                      Select a surveyed village on the map to inspect its 6 sectoral activity profiles (Demography, Land &amp; Water, Energy, Transport, Waste, Livestock).
                    </p>
                    <div className="scalgo-empty-icons" aria-hidden>
                      <span><Layers size={18} /></span>
                      <span><BarChart3 size={18} /></span>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
