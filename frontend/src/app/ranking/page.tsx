"use client";

import { useMemo, useState } from "react";
import { SimpleBarChart } from "@/components/charts";
import { ALL_BLOCKS, useDashboard } from "@/components/DashboardContext";
import { Card, DataTable, PageTitle, type Column } from "@/components/ui";
import { SCALES, scaleColors } from "@/lib/colors";
import { fmt, num } from "@/lib/format";
import type { NumericKey, Village } from "@/lib/types";

const METRICS: { label: string; col: NumericKey; decimals: number }[] = [
  { label: "Total Carbon Emission (t CO2e/yr)", col: "total_co2e_t_yr", decimals: 2 },
  { label: "Per Capita Carbon (kg CO2e/yr)", col: "per_capita_co2e_kg_yr", decimals: 2 },
  { label: "Total Population (Residents)", col: "total_residents", decimals: 0 },
  { label: "Agricultural Land Area (ha)", col: "agri_area_ha", decimals: 2 },
  { label: "Electricity Consumption (kWh/mo)", col: "electricity_monthly_kwh", decimals: 1 },
  { label: "Solid Waste Generation (kg/mo)", col: "waste_monthly_kg", decimals: 1 },
  { label: "Total Livestock Count", col: "total_livestock", decimals: 0 },
];
const TOP_N = [15, 25, 50, 100];

type Ranked = Village & { rank: number };

export default function RankingPage() {
  const { allVillages, selectedBlock } = useDashboard();
  const [metricIdx, setMetricIdx] = useState(0);
  const [ascending, setAscending] = useState(false);
  const [topN, setTopN] = useState(15);
  const metric = METRICS[metricIdx];

  const ranked = useMemo<Ranked[]>(() => {
    const pool = selectedBlock === ALL_BLOCKS ? allVillages : allVillages.filter((v) => v.block_name === selectedBlock);
    return [...pool]
      .sort((a, b) => (ascending ? num(a[metric.col]) - num(b[metric.col]) : num(b[metric.col]) - num(a[metric.col])))
      .slice(0, topN)
      .map((v, i) => ({ ...v, rank: i + 1 }));
  }, [allVillages, selectedBlock, metric, ascending, topN]);

  const columns: Column<Ranked>[] = [
    { key: "rank", label: "Rank", numeric: true },
    { key: "village_name", label: "Village" },
    { key: "block_name", label: "Block" },
    { key: "village_code", label: "Code" },
    { key: metric.col, label: metric.label, numeric: true, render: (v) => fmt(v[metric.col], metric.decimals) },
    { key: "total_residents", label: "Residents", numeric: true, render: (v) => fmt(v.total_residents) },
    { key: "total_area_ha", label: "Area (ha)", numeric: true, render: (v) => fmt(v.total_area_ha, 2) },
    { key: "total_co2e_t_yr", label: "Total CO2e (t/yr)", numeric: true, render: (v) => fmt(v.total_co2e_t_yr, 2) },
  ];

  return (
    <>
      <PageTitle>🏆 Village Environmental &amp; Emission Ranking</PageTitle>
      <div className="controls">
        <label className="field grow">
          <span>Ranking Metric:</span>
          <select value={metricIdx} onChange={(e) => setMetricIdx(Number(e.target.value))}>
            {METRICS.map((m, i) => <option key={m.col} value={i}>{m.label}</option>)}
          </select>
        </label>
        <div className="field">
          <span>Sort Order:</span>
          <div className="radio-row">
            <label><input type="radio" checked={!ascending} onChange={() => setAscending(false)} /> Highest First (Descending)</label>
            <label><input type="radio" checked={ascending} onChange={() => setAscending(true)} /> Lowest First (Ascending)</label>
          </div>
        </div>
        <label className="field">
          <span>Show Top:</span>
          <select value={topN} onChange={(e) => setTopN(Number(e.target.value))}>
            {TOP_N.map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <Card title={`Ranked by ${metric.label} (${ascending ? "Bottom" : "Top"} ${topN})`}>
        <SimpleBarChart
          data={ranked.map((v) => ({ village: `${v.rank}. ${v.village_name}`, value: v[metric.col] }))}
          category="village"
          series={[{ key: "value", name: metric.label }]}
          rowColors={scaleColors(ranked.map((v) => num(v[metric.col])), SCALES.viridis)}
          decimals={metric.decimals}
          showValues={topN <= 25}
          angledTicks
          height={420}
        />
      </Card>
      <div style={{ marginTop: 14 }}>
        <DataTable rows={ranked} columns={columns} rowKey={(v) => v.village_code} />
      </div>
    </>
  );
}
