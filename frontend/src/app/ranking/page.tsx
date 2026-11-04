"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { ALL_BLOCKS, useDashboard } from "@/components/DashboardContext";
import type { RankBand } from "@/components/RankingMap";
import { PageTitle } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { NumericKey, Village } from "@/lib/types";

// Leaflet needs the browser window, so the map is client-only.
const RankingMap = dynamic(() => import("@/components/RankingMap"), {
  ssr: false,
  loading: () => <div className="loading">Rendering village ranking map…</div>,
});

// Rank 1 gets the first (darkest) colour of the metric's ramp.
const RAMPS = {
  reds: ["#67000d", "#a50f15", "#d7301f", "#fc4e2a", "#fd8d3c", "#fecc5c", "#ffffcc"],
  purples: ["#3f007d", "#54278f", "#6a51a3", "#807dba", "#9e9ac8", "#cbc9e2", "#f2f0f7"],
  greens: ["#00441b", "#006d2c", "#238b45", "#41ab5d", "#74c476", "#a1d99b", "#e5f5e0"],
  blues: ["#08306b", "#08519c", "#2171b5", "#4292c6", "#6baed6", "#9ecae1", "#deebf7"],
  browns: ["#4a1d00", "#7f2704", "#a63603", "#d94801", "#f16913", "#fdae6b", "#fee6ce"],
};

const METRICS: { label: string; col: NumericKey; decimals: number; unit: string; ramp: keyof typeof RAMPS }[] = [
  { label: "Total Carbon Emission", col: "total_co2e_t_yr", decimals: 1, unit: "t CO₂e/yr", ramp: "reds" },
  { label: "Per Capita Carbon", col: "per_capita_co2e_kg_yr", decimals: 1, unit: "kg CO₂e/yr", ramp: "reds" },
  { label: "Total Population", col: "total_residents", decimals: 0, unit: "residents", ramp: "purples" },
  { label: "Agricultural Land Area", col: "agri_area_ha", decimals: 1, unit: "ha", ramp: "greens" },
  { label: "Electricity Consumption", col: "electricity_monthly_kwh", decimals: 0, unit: "kWh/month", ramp: "blues" },
  { label: "Solid Waste Generation", col: "waste_monthly_kg", decimals: 0, unit: "kg/month", ramp: "browns" },
  { label: "Total Livestock Count", col: "total_livestock", decimals: 0, unit: "head", ramp: "browns" },
];
const TABLE_ROWS = [25, 50, 100, 0]; // 0 = all
// Upper rank of each legend band; the last band runs to the end of the pool.
const BAND_ENDS = [10, 25, 50, 100, 250, 500];

type Ranked = Village & { rank: number; value: number };

function rankBands(n: number, ramp: string[]): RankBand[] {
  const ends = [...BAND_ENDS.filter((e) => e < n), n];
  return ends.map((to, i) => {
    const from = i ? ends[i - 1] + 1 : 1;
    return { from, to, color: ramp[Math.round((i * (ramp.length - 1)) / Math.max(ends.length - 1, 1))], label: from === to ? `${from}` : `${from}–${to}` };
  });
}

export default function RankingPage() {
  const { allVillages, selectedBlock, selectedCode, setSelectedCode, showCodes } = useDashboard();
  const [metricIdx, setMetricIdx] = useState(0);
  const [ascending, setAscending] = useState(false);
  const [tableRows, setTableRows] = useState(50);
  const metric = METRICS[metricIdx];
  const tableRef = useRef<HTMLDivElement>(null);

  // Villages without a value for the metric are left unranked ("No data").
  const ranked = useMemo<Ranked[]>(() => {
    const pool = selectedBlock === ALL_BLOCKS ? allVillages : allVillages.filter((v) => v.block_name === selectedBlock);
    return pool
      .filter((v) => v[metric.col] != null)
      .map((v) => ({ ...v, value: Number(v[metric.col]), rank: 0 }))
      .sort((a, b) => (ascending ? a.value - b.value : b.value - a.value) || a.village_name.localeCompare(b.village_name))
      .map((v, i) => ({ ...v, rank: i + 1 }));
  }, [allVillages, selectedBlock, metric, ascending]);

  const bands = useMemo(() => rankBands(ranked.length, RAMPS[metric.ramp]), [ranked.length, metric.ramp]);
  const ranks = useMemo(
    () => new Map(ranked.map((v) => [v.village_code, { rank: v.rank, value: v.value, name: v.village_name, block: v.block_name }])),
    [ranked],
  );
  const selected = ranked.find((v) => v.village_code === selectedCode);
  const rows = tableRows ? ranked.slice(0, tableRows) : ranked;
  // Keep the selected village in the table even when it is outside the shown rows.
  const extra = selected && !rows.includes(selected) ? selected : null;
  const bandIndex = (rank: number) => bands.findIndex((b) => rank >= b.from && rank <= b.to);
  // Dark bands (first ~60%) get white text.
  const badge = (rank: number) => {
    const i = bandIndex(rank);
    return { background: bands[i]?.color ?? "#cfd8dc", color: i >= 0 && i < Math.ceil(bands.length * 0.6) ? "#fff" : "#263238" };
  };

  // Bring the chosen village's row into view when the viewer picks one (not on first load, which starts at rank 1).
  const firstCode = useRef(selectedCode);
  useEffect(() => {
    if (selectedCode === firstCode.current) return;
    firstCode.current = null;
    tableRef.current?.querySelector(".rank-row.selected")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selectedCode]);

  const Row = ({ v }: { v: Ranked }) => (
    <tr className={`rank-row ${v.village_code === selectedCode ? "selected" : ""}`} onClick={() => setSelectedCode(v.village_code)}>
      <td className="num"><span className="rank-badge" style={badge(v.rank)}>{v.rank}</span></td>
      <td>
        <b>{v.village_name}</b>
        {showCodes && <code className="rank-code">{v.village_code}</code>}
        <small>{v.block_name}</small>
      </td>
      <td className="num">{fmt(v.value, metric.decimals)}</td>
    </tr>
  );

  return (
    <>
      <PageTitle>🏆 Village Environmental &amp; Emission Ranking</PageTitle>
      <div className="controls rank-controls">
        <label className="field grow">
          <span>Ranking metric</span>
          <select value={metricIdx} onChange={(e) => setMetricIdx(Number(e.target.value))}>
            {METRICS.map((m, i) => <option key={m.col} value={i}>{m.label} ({m.unit})</option>)}
          </select>
        </label>
        <label className="field">
          <span>Rank 1 is</span>
          <select value={ascending ? "low" : "high"} onChange={(e) => setAscending(e.target.value === "low")}>
            <option value="high">Highest value</option>
            <option value="low">Lowest value</option>
          </select>
        </label>
        <label className="field">
          <span>Table shows</span>
          <select value={tableRows} onChange={(e) => setTableRows(Number(e.target.value))}>
            {TABLE_ROWS.map((n) => <option key={n} value={n}>{n ? `Top ${n}` : `All ${ranked.length.toLocaleString()}`}</option>)}
          </select>
        </label>
      </div>

      <div className="rank-layout">
        <RankingMap
          ranks={ranks}
          bands={bands}
          metricLabel={`${metric.label} (${metric.unit})`}
          decimals={metric.decimals}
          selectedCode={selectedCode}
          onSelect={setSelectedCode}
          styleKey={`${metric.col}|${ascending}|${selectedBlock}|${ranked.length}`}
        />

        <section className="rank-table-card" aria-label="Village ranking table">
          <header>
            <b>{metric.label}</b>
            <small>
              {ranked.length.toLocaleString()} villages{selectedBlock !== ALL_BLOCKS ? ` in ${selectedBlock}` : ""} ·
              rank 1 = {ascending ? "lowest" : "highest"} · click a row to show it on the map
            </small>
          </header>
          <div className="rank-table-wrap" ref={tableRef}>
            <table className="rank-table">
              <thead>
                <tr><th className="num">Rank</th><th>Village</th><th className="num">{metric.unit}</th></tr>
              </thead>
              <tbody>
                {rows.map((v) => <Row key={v.village_code} v={v} />)}
                {extra && (
                  <>
                    <tr className="rank-gap"><td colSpan={3}>…</td></tr>
                    <Row v={extra} />
                  </>
                )}
              </tbody>
            </table>
          </div>
          {selected && (
            <footer>
              <b>{selected.village_name}</b> is ranked <b>#{selected.rank}</b> of {ranked.length.toLocaleString()} with {fmt(selected.value, metric.decimals)} {metric.unit}.
            </footer>
          )}
        </section>
      </div>
    </>
  );
}
