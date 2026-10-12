"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ALL_BLOCKS, useDashboard } from "@/components/DashboardContext";
import { Alert, PageTitle } from "@/components/ui";
import { THEMATIC_METRICS } from "@/components/VillageMap";
import { fmt } from "@/lib/format";

// Leaflet needs the browser window, so the map is client-only.
const VillageMap = dynamic(() => import("@/components/VillageMap"), {
  ssr: false,
  loading: () => <div className="loading">Rendering GIS Map with Village Polygons…</div>,
});

export default function MapPage() {
  const { allVillages, selectedCode, setSelectedCode, selectedBlock, activeVillage: v } = useDashboard();
  const [metricIdx, setMetricIdx] = useState(0);
  const metric = THEMATIC_METRICS[metricIdx];

  return (
    <>
      <PageTitle>🗺️ Varanasi District Interactive Village GIS Map</PageTitle>
      <div className="split-map">
        <VillageMap
          villages={allVillages}
          selectedCode={selectedCode}
          blockFilter={selectedBlock === ALL_BLOCKS ? null : selectedBlock}
          metric={metric}
          onSelect={setSelectedCode}
        />
        <div>
          <h4>🎨 Thematic Map Layers</h4>
          <label className="field">
            <span>Select Thematic Metric to Classify:</span>
            <select value={metricIdx} onChange={(e) => setMetricIdx(Number(e.target.value))}>
              {THEMATIC_METRICS.map((m, i) => <option key={m.col} value={i}>{m.label}</option>)}
            </select>
          </label>
          <p className="caption">Color gradient dynamically adjusts based on metric values across village polygons.</p>
          <hr />
          {v && (
            <dl className="info-list">
              <div><dt>Name</dt><dd>{v.village_name}</dd></div>
              <div><dt>Block</dt><dd>{v.block_name}</dd></div>
              <div><dt>Code</dt><dd><code>{v.village_code}</code></dd></div>
              <div><dt>Residents</dt><dd>{fmt(v.total_residents)}</dd></div>
              <div><dt>Total Area</dt><dd>{fmt(v.total_area_ha, 1)} ha</dd></div>
              <div><dt>Emissions</dt><dd>{fmt(v.total_co2e_t_yr, 1)} t CO₂e/yr</dd></div>
              <div><dt>Per Capita</dt><dd>{fmt(v.per_capita_co2e_kg_yr, 1)} kg/yr</dd></div>
            </dl>
          )}
          <hr />
          <Alert kind="info">💡 <b>Interactive Tip:</b> Click any village polygon on the map or use the header dropdown to update the active selection.</Alert>
        </div>
      </div>
    </>
  );
}
