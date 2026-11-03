"use client";

import { useMemo, type CSSProperties } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Flame, Leaf, RotateCcw, Sparkles, Sun, Trash2, TreePine, Zap } from "lucide-react";
import { fmt } from "@/lib/format";
import type { VillageDetails } from "@/lib/types";
import type { Emissions } from "./CarbonLabScene";

// A mature agroforestry / broadleaf tree in Uttar Pradesh absorbs ~22 kg CO2/year (IPCC default).
export const TREE_KG_YR = 22;

export interface MitigationState {
  trees: number; // 0 to 25,000+
  solarPct: number; // 0 to 100%
  biogasPct: number; // 0 to 100%
  compostPct: number; // 0 to 100%
  evPct: number; // 0 to 100%
  agriPct: number; // 0 to 100%
}

export const DEFAULT_MITIGATION: MitigationState = {
  trees: 800,
  solarPct: 0,
  biogasPct: 0,
  compostPct: 0,
  evPct: 0,
  agriPct: 0,
};

interface Props {
  village: VillageDetails;
  grossEmissions: Emissions;
  mitigation: MitigationState;
  onChange: (fn: (prev: MitigationState) => MitigationState) => void;
}

export default function MitigationPanel({ village, grossEmissions, mitigation, onChange }: Props) {
  // Gross total from all emission sources (t CO2e/year)
  const grossTotal = useMemo(
    () => Object.values(grossEmissions).reduce((acc, v) => acc + (v || 0), 0),
    [grossEmissions]
  );

  // Carbon sequestration from trees: (trees * 22 kg) / 1000 = tonnes CO2/yr
  const treeSequestered = (mitigation.trees * TREE_KG_YR) / 1000;

  // Clean intervention emission savings (t CO2e/yr)
  const solarSavings = ((grossEmissions.electricity || 0) * mitigation.solarPct) / 100;
  const biogasSavings = ((grossEmissions.firewood || 0) * mitigation.biogasPct) / 100;
  const compostSavings = ((grossEmissions.waste || 0) * mitigation.compostPct) / 100;
  const evSavings = ((grossEmissions.petrol || 0) * mitigation.evPct) / 100;
  const agriSavings = (((grossEmissions.cow || 0) + (grossEmissions.goat || 0) + (grossEmissions.sheep || 0)) * 0.25 * mitigation.agriPct) / 100;

  const totalAvoided = solarSavings + biogasSavings + compostSavings + evSavings + agriSavings;
  const totalPositiveOffset = totalAvoided + treeSequestered;
  const netEmissions = Math.max(0, grossTotal - totalPositiveOffset);
  const netZeroPct = grossTotal > 0 ? Math.min(100, Math.round((totalPositiveOffset / grossTotal) * 100)) : 100;

  // Number of trees needed to achieve 100% Net-Zero alone
  const treesNeededForNetZero = Math.ceil((grossTotal * 1000) / TREE_KG_YR);

  const update = <K extends keyof MitigationState>(key: K, val: MitigationState[K]) => {
    onChange((prev) => ({ ...prev, [key]: val }));
  };

  const isZeroTrees = mitigation.trees === 0;

  return (
    <div className="mitigation-panel">
      <div className="lab-panel-head">
        <div>
          <h4>🌱 Climate Interventions & Sinks</h4>
          <p className="caption" style={{ margin: 0 }}>Offset & reduce village emissions</p>
        </div>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => onChange(() => DEFAULT_MITIGATION)}
          title="Reset mitigation interventions"
        >
          <RotateCcw size={13} /> Reset
        </button>
      </div>

      {/* Preset Action Chips */}
      <div className="mitigation-presets">
        <button
          type="button"
          className={`mit-chip ${isZeroTrees ? "warn-active" : ""}`}
          onClick={() => update("trees", 0)}
          title="See what happens with 0 trees (deforestation)"
        >
          🚫 No Trees (0)
        </button>
        <button
          type="button"
          className={`mit-chip ${mitigation.trees === 1000 ? "active" : ""}`}
          onClick={() => update("trees", 1000)}
        >
          🌲 1k Trees (+22 t)
        </button>
        <button
          type="button"
          className={`mit-chip ${mitigation.trees === 5000 ? "active" : ""}`}
          onClick={() => update("trees", 5000)}
        >
          🌳 5k Trees (+110 t)
        </button>
        <button
          type="button"
          className={`mit-chip ${netZeroPct >= 100 ? "active-gold" : ""}`}
          onClick={() => {
            onChange(() => ({
              trees: Math.min(25000, Math.ceil((grossTotal * 0.45 * 1000) / TREE_KG_YR)),
              solarPct: 75,
              biogasPct: 80,
              compostPct: 70,
              evPct: 50,
              agriPct: 40,
            }));
          }}
          title="Combine clean technologies and agroforestry to achieve 100% Net Zero"
        >
          🎯 Target Net-Zero
        </button>
      </div>

      {/* Net Zero Progress Indicator */}
      <div className="net-zero-card">
        <div className="net-zero-top">
          <span className="net-zero-label">
            <Sparkles size={15} color={netZeroPct >= 100 ? "#2e7d32" : "#f57c00"} />
            <b>Net-Zero Progress: {netZeroPct}%</b>
          </span>
          <span className="net-zero-val">
            Net: <b>{fmt(netEmissions, 1)} t</b> / Gross: {fmt(grossTotal, 1)} t
          </span>
        </div>
        <div className="progress-bar-track">
          <div
            className={`progress-bar-fill ${netZeroPct >= 100 ? "complete" : ""}`}
            style={{ width: `${Math.min(100, Math.max(0, netZeroPct))}%` }}
          />
        </div>
        <div className="net-zero-summary">
          <span>Avoided: <b>-{fmt(totalAvoided, 1)} t</b></span>
          <span>Trees Sunk: <b>-{fmt(treeSequestered, 1)} t</b></span>
        </div>
      </div>

      {/* Impact Explanation Box: Live reaction to "Drag no tree" or adding trees */}
      {isZeroTrees ? (
        <div className="mitigation-impact-alert warn">
          <div className="alert-head">
            <AlertTriangle size={18} className="icon-warn" />
            <strong>🚨 ZERO TREE IMPACT: Severe Carbon Risk</strong>
          </div>
          <p>
            With <b>0 trees</b> planted in {village.village_name}, <b>0 kg of CO₂ is absorbed</b> from the air.
            The village has zero natural carbon buffer. All <b>{fmt(grossTotal, 1)} tonnes</b> of gross emissions
            remain trapped in the local atmosphere, generating a thick smog layer and increasing ambient heat.
          </p>
          <div className="alert-hint">
            👉 Drag the <b>Planted Trees</b> slider below to start capturing carbon!
          </div>
        </div>
      ) : netZeroPct >= 100 ? (
        <div className="mitigation-impact-alert success">
          <div className="alert-head">
            <CheckCircle2 size={18} className="icon-success" />
            <strong>🎉 100% Net-Zero Village Achieved!</strong>
          </div>
          <p>
            The combination of <b>{fmt(mitigation.trees)} trees</b> and clean energy interventions completely
            offsets and sequesters the village footprint! The 3D atmosphere is crystal clear with zero smog.
          </p>
        </div>
      ) : (
        <div className="mitigation-impact-alert info">
          <div className="alert-head">
            <Leaf size={18} className="icon-leaf" />
            <strong>🌿 Active Carbon Sequestration</strong>
          </div>
          <p>
            <b>{fmt(mitigation.trees)} trees</b> actively absorb <b>{fmt(treeSequestered, 1)} t CO₂e/yr</b> (~{grossTotal > 0 ? ((treeSequestered / grossTotal) * 100).toFixed(1) : 0}% of emissions).
            Additional trees thin the smog blanket and cool local temperatures.
          </p>
        </div>
      )}

      {/* Intervention 1: Tree Planting Slider (Highlighted) */}
      <div className={`mit-slider-group primary-sink ${isZeroTrees ? "zero-trees" : ""}`}>
        <div className="mit-slider-header">
          <span className="mit-title">
            <TreePine size={18} color={isZeroTrees ? "#c62828" : "#2e7d32"} />
            <b>Planted Trees (Carbon Sink)</b>
          </span>
          <span className={`mit-badge ${isZeroTrees ? "badge-zero" : "badge-green"}`}>
            {isZeroTrees ? "0 kg absorbed" : `-${fmt(treeSequestered, 1)} t CO₂/yr`}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(15000, treesNeededForNetZero + 1000)}
          step={50}
          value={mitigation.trees}
          aria-label="Planted Trees"
          onChange={(e) => update("trees", Number(e.target.value))}
        />
        <div className="mit-slider-foot">
          <span><b>{fmt(mitigation.trees)}</b> mature trees</span>
          <span className="rate-text">~22 kg CO₂ / tree / yr</span>
        </div>
      </div>

      <div className="mitigation-divider">
        <span>⚡ CLEAN TECH REDUCTION FACTORS</span>
      </div>

      {/* Factor 2: Rooftop Solar Clean Power */}
      <div className="mit-slider-group">
        <div className="mit-slider-header">
          <span className="mit-title">
            <Sun size={17} color="#f57f17" />
            <span>Rooftop Solar PV Adoption</span>
          </span>
          <span className="mit-savings">
            {solarSavings > 0 ? `-${fmt(solarSavings, 1)} t` : "0 t"}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={mitigation.solarPct}
          aria-label="Rooftop Solar Adoption %"
          onChange={(e) => update("solarPct", Number(e.target.value))}
        />
        <div className="mit-slider-foot">
          <span>{mitigation.solarPct}% household solar</span>
          <span>Cuts coal grid power (0.82 kg/kWh)</span>
        </div>
      </div>

      {/* Factor 3: Biogas & Improved Cookstoves */}
      <div className="mit-slider-group">
        <div className="mit-slider-header">
          <span className="mit-title">
            <Flame size={17} color="#e65100" />
            <span>Clean Biogas Cooking</span>
          </span>
          <span className="mit-savings">
            {biogasSavings > 0 ? `-${fmt(biogasSavings, 1)} t` : "0 t"}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={mitigation.biogasPct}
          aria-label="Clean Biogas Cooking %"
          onChange={(e) => update("biogasPct", Number(e.target.value))}
        />
        <div className="mit-slider-foot">
          <span>{mitigation.biogasPct}% firewood replaced</span>
          <span>Eliminates chulha black carbon</span>
        </div>
      </div>

      {/* Factor 4: Waste Composting */}
      <div className="mit-slider-group">
        <div className="mit-slider-header">
          <span className="mit-title">
            <Trash2 size={17} color="#7b1fa2" />
            <span>Organic Waste Composting</span>
          </span>
          <span className="mit-savings">
            {compostSavings > 0 ? `-${fmt(compostSavings, 1)} t` : "0 t"}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={mitigation.compostPct}
          aria-label="Waste Composting %"
          onChange={(e) => update("compostPct", Number(e.target.value))}
        />
        <div className="mit-slider-foot">
          <span>{mitigation.compostPct}% waste composted</span>
          <span>Avoids open-dump methane (CH₄)</span>
        </div>
      </div>

      {/* Factor 5: Electric Mobility */}
      <div className="mit-slider-group">
        <div className="mit-slider-header">
          <span className="mit-title">
            <Zap size={17} color="#0288d1" />
            <span>E-Mobility (Electric 2-Wheelers)</span>
          </span>
          <span className="mit-savings">
            {evSavings > 0 ? `-${fmt(evSavings, 1)} t` : "0 t"}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={mitigation.evPct}
          aria-label="E-Mobility %"
          onChange={(e) => update("evPct", Number(e.target.value))}
        />
        <div className="mit-slider-foot">
          <span>{mitigation.evPct}% petrol bikes switched to EV</span>
          <span>Zero road tailpipe emissions</span>
        </div>
      </div>

      {/* Factor 6: Regenerative Agriculture & Biochar */}
      <div className="mit-slider-group">
        <div className="mit-slider-header">
          <span className="mit-title">
            <Leaf size={17} color="#558b2f" />
            <span>Crop Residue Biochar & Feed Mgmt</span>
          </span>
          <span className="mit-savings">
            {agriSavings > 0 ? `-${fmt(agriSavings, 1)} t` : "0 t"}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={mitigation.agriPct}
          aria-label="Residue Biochar & Feed Mgmt %"
          onChange={(e) => update("agriPct", Number(e.target.value))}
        />
        <div className="mit-slider-foot">
          <span>{mitigation.agriPct}% residue biochar adoption</span>
          <span>Avoids stubble burning & enteric CH₄</span>
        </div>
      </div>
    </div>
  );
}

