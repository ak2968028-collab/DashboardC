"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, X } from "lucide-react";
import { QUALITATIVE, SimpleBarChart } from "@/components/charts";
import { useDashboard, villageLabel } from "@/components/DashboardContext";
import { VillageCombobox } from "@/components/VillageSelector";
import { Alert, Card, DataTable, PageTitle, type Column } from "@/components/ui";
import type { Basemap, SwipeLayer } from "@/components/SwipeMap";
import { useEmissionGrid } from "@/lib/api";
import { fmt } from "@/lib/format";
import type { Village } from "@/lib/types";

// Leaflet needs the browser window, so the map is client-only.
const SwipeMap = dynamic(() => import("@/components/SwipeMap"), {
  ssr: false,
  loading: () => <div className="swipe-wrap loading">Loading comparison map…</div>,
});

const LAYERS: { key: SwipeLayer; label: string }[] = [
  { key: "total", label: "Total emissions (t CO₂e/ha/yr)" },
  { key: "firewood", label: "Firewood" }, { key: "livestock", label: "Livestock" },
  { key: "electricity", label: "Grid electricity" }, { key: "waste", label: "Solid waste" },
  { key: "lpg", label: "LPG" }, { key: "transport", label: "Motorbike petrol" },
  { key: "landcover", label: "Land cover (khasra parcels)" },
  { key: "none", label: "Boundary only" },
];
const LANDCOVER_LEGEND = [
  ["Built-up", "#d9c7a5"], ["Cropland", "#aed581"], ["Trees", "#2e7d32"], ["Water", "#4fc3f7"],
  ["Rangeland", "#c0a96e"], ["Bare ground", "#bcaaa4"],
];

const MAX_VILLAGES = 5;

const MATRIX: { label: string; key: keyof Village; decimals?: number }[] = [
  { label: "Village Name", key: "village_name" },
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
  { label: "Total Carbon (t CO2e/yr)", key: "total_co2e_t_yr", decimals: 2 },
  { label: "Per Capita (kg CO2e/yr)", key: "per_capita_co2e_kg_yr", decimals: 2 },
];

export default function ComparisonPage() {
  const { allVillages, filteredVillages, selectedCode, showCodes } = useDashboard();
  const [codes, setCodes] = useState<string[]>([]);
  const [layer, setLayer] = useState<SwipeLayer>("total");
  const [basemap, setBasemap] = useState<Basemap>("streets");

  // Default: the active village plus the next village in the list.
  useEffect(() => {
    if (codes.length || !selectedCode) return;
    const other = filteredVillages.find((v) => v.village_code !== selectedCode);
    setCodes(other ? [selectedCode, other.village_code] : [selectedCode]);
  }, [selectedCode, filteredVillages, codes.length]);

  const byCode = useMemo(() => new Map(allVillages.map((v) => [v.village_code, v])), [allVillages]);
  const chosen = codes.map((c) => byCode.get(c)).filter((v): v is Village => !!v);
  const available = filteredVillages.filter((v) => !codes.includes(v.village_code));
  const [left, right] = chosen;
  // Legend classes are shared by every village's raster, so either side's grid gives the legend.
  const { data: legendGrid } = useEmissionGrid(left?.village_code ?? null);
  const legend = layer !== "landcover" && layer !== "none" ? (legendGrid?.legends[layer] ?? []).filter((l) => l.opacity > 0) : [];
  const setSlot = (i: number, code: string) => {
    const next = [...codes];
    const existing = next.indexOf(code);
    if (existing >= 0) [next[existing], next[i]] = [next[i], next[existing]];
    else next[i] = code;
    setCodes(next.filter(Boolean));
  };

  const columns: Column<Village>[] = MATRIX.map((m) => ({
    key: m.key,
    label: m.label,
    numeric: m.decimals !== undefined,
    render: (v) => (m.decimals !== undefined ? fmt(v[m.key] as number | null, m.decimals) : String(v[m.key] ?? "")),
  }));

  return (
    <>
      <PageTitle>Swipe Map: Two Villages Side by Side</PageTitle>
      <p className="caption swipe-intro">Drag the handle in the middle of the map to compare two villages, as in Google Earth Engine. Both sides keep the same zoom; panning one moves the other by the same distance from its village centre.</p>
      <div className="swipe-controls">
        <VillageCombobox villages={allVillages} value={left?.village_code ?? null} onChange={(c) => setSlot(0, c)} label="Left village" showCodes={showCodes} />
        <button type="button" className="btn swipe-swap" aria-label="Swap left and right villages" disabled={chosen.length < 2}
          onClick={() => setCodes([codes[1], codes[0], ...codes.slice(2)])}><ArrowLeftRight size={16} /></button>
        <VillageCombobox villages={allVillages} value={right?.village_code ?? null} onChange={(c) => setSlot(1, c)} label="Right village" showCodes={showCodes} />
        <label className="field"><span>Layer</span>
          <select value={layer} onChange={(e) => setLayer(e.target.value as SwipeLayer)}>
            {LAYERS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
        </label>
        <span className="lab-toggle swipe-basemap" role="group" aria-label="Basemap">
          <button type="button" className={basemap === "streets" ? "active" : ""} onClick={() => setBasemap("streets")}>Streets</button>
          <button type="button" className={basemap === "satellite" ? "active" : ""} onClick={() => setBasemap("satellite")}>Satellite</button>
        </span>
      </div>
      {left && right ? (
        <>
          <SwipeMap left={left} right={right} layer={layer} basemap={basemap} />
          <div className="swipe-legend">
            {layer === "landcover" ? LANDCOVER_LEGEND.map(([label, color]) => <span key={label}><i style={{ background: color }} />{label}</span>)
              : legend.map((l) => <span key={l.label}><i style={{ background: l.color }} />{l.label.replace("&lt;", "<").replace("&gt;", ">")}</span>)}
            {layer !== "landcover" && layer !== "none" && <small>t CO₂e per hectare per year · same classes on both sides</small>}
          </div>
        </>
      ) : (
        <Alert kind="info">Choose two villages to open the swipe map.</Alert>
      )}

      <PageTitle>Multi-Village Comparative Analysis</PageTitle>
      <p>Select 2 to 5 villages to evaluate side-by-side across all 12 parameters and total greenhouse gas emissions.</p>
      <div className="compare-picker">
        <VillageCombobox
          villages={available}
          value={null}
          onChange={(code) => setCodes([...codes, code])}
          label={`Add villages to compare (${codes.length} of ${MAX_VILLAGES})`}
          placeholder={codes.length >= MAX_VILLAGES ? "Maximum of 5 villages selected" : "Search a village to add…"}
          showCodes={showCodes}
          clearOnSelect
          disabled={codes.length >= MAX_VILLAGES}
        />
      </div>
      <div className="chip-row">
        {chosen.map((v) => (
          <span key={v.village_code} className="chip">
            {villageLabel(v, showCodes)}
            <button onClick={() => setCodes(codes.filter((c) => c !== v.village_code))} aria-label={`Remove ${v.village_name}`}><X size={14} /></button>
          </span>
        ))}
      </div>

      {chosen.length >= 2 ? (
        <>
          <Card title="Comparison: Total Carbon Footprint (t CO2e/year)">
            <SimpleBarChart
              data={chosen.map((v) => ({ village: v.village_name, total: v.total_co2e_t_yr }))}
              category="village"
              series={[{ key: "total", name: "Total Emissions (t CO2e/yr)" }]}
              rowColors={QUALITATIVE}
              valueLabel="Total Emissions (t CO2e/yr)"
            />
          </Card>
          <h5 className="card-title" style={{ marginTop: 18 }}>📋 Comparative Data Matrix</h5>
          <DataTable rows={chosen} columns={columns} rowKey={(v) => v.village_code} />
        </>
      ) : (
        <Alert kind="warning">Please select at least 2 villages to view the comparative matrix.</Alert>
      )}
    </>
  );
}
