"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Beef, Bike, Flame, Fuel, Map as MapIcon, RotateCcw, Sprout, Trash2, TreePine, Zap, type LucideIcon } from "lucide-react";
import CarbonLabScene, { SOURCE_COLORS, type Emissions, type SourceKey } from "@/components/CarbonLabScene";
import FactorPanel from "@/components/FactorPanel";
import { Badge, MetricCard, PageTitle, WithVillage } from "@/components/ui";
import { useEmissionFactors, useVillageScene } from "@/lib/api";
import { fmt, num } from "@/lib/format";
import type { NumericKey, VillageDetails } from "@/lib/types";

// Mirrors fast_backend carbon.py: DEFAULT_FACTORS, overridden by the emission factor table when it matches.
const DEFAULT_FACTORS: Record<SourceKey, number> = {
  lpg: 2.984, firewood: 1.747, electricity: 0.82, petrol: 2.31, waste: 0.45, cow: 980, goat: 145.6, sheep: 145.6,
};
const ACTIVITY_KEYS: [string, SourceKey][] = [
  ["lpg", "lpg"], ["firewood", "firewood"], ["electricity", "electricity"], ["fuel", "petrol"], ["petrol", "petrol"],
  ["waste", "waste"], ["cattle", "cow"], ["cow", "cow"], ["goat", "goat"], ["sheep", "sheep"],
];
// A mature tree absorbs roughly 22 kg CO2 a year.
const TREE_KG_YR = 22;

interface Source {
  key: SourceKey;
  label: string;
  icon: LucideIcon;
  /** Picture from public/icon, shown instead of `icon` when present. */
  img?: string;
  field: NumericKey;
  unit: string;
  /** Activity is reported per month and multiplied by 12. */
  monthly: boolean;
  factorUnit: string;
  minMax: number;
  gases: string;
  effect: string;
}

const SOURCES: Source[] = [
  {
    key: "lpg", label: "LPG Cooking", icon: Flame, field: "lpg_monthly_kg", unit: "kg/month", monthly: true,
    factorUnit: "kg CO₂e/kg", minMax: 600, gases: "CO₂",
    effect: "Clean combustion in household stoves. Releases CO₂ from each house chimney, but far less smoke than wood.",
  },
  {
    key: "firewood", label: "Firewood (Chulha)", icon: Flame, field: "firewood_monthly_kg", unit: "kg/month", monthly: true,
    factorUnit: "kg CO₂e/kg", minMax: 3000, gases: "CO₂ · CH₄ · N₂O · black carbon",
    effect: "Incomplete burning in open chulhas sends thick smoke out of homes. It adds CO₂, methane and soot and harms indoor air for women and children.",
  },
  {
    key: "electricity", label: "Grid Electricity", icon: Zap, img: "/icon/electric-tower.png", field: "electricity_monthly_kwh", unit: "kWh/month", monthly: true,
    factorUnit: "kg CO₂/kWh", minMax: 8000, gases: "CO₂ (off-site, coal power)",
    effect: "Each unit used in the village is generated far away at a mostly coal-fired plant. The emissions come out of the plant's stack and travel down the power line.",
  },
  {
    key: "petrol", label: "Motorbike Petrol", icon: Bike, img: "/icon/motorbike.png", field: "petrol_monthly_litres", unit: "litres/month", monthly: true,
    factorUnit: "kg CO₂e/litre", minMax: 800, gases: "CO₂ · NOₓ",
    effect: "Two-wheelers on village roads burn petrol. More litres means more bikes on the road and more exhaust at ground level.",
  },
  {
    key: "waste", label: "Solid Waste", icon: Trash2, field: "waste_monthly_kg", unit: "kg/month", monthly: true,
    factorUnit: "kg CO₂e/kg", minMax: 3000, gases: "CH₄ (methane)",
    effect: "Mixed waste rotting in open dumps decomposes without oxygen and bubbles out methane, a gas about 28× stronger than CO₂.",
  },
  {
    key: "cow", label: "Cattle", icon: Beef, img: "/icon/cow.png", field: "cows_count", unit: "head", monthly: false,
    factorUnit: "kg CO₂e/head/yr", minMax: 60, gases: "CH₄ · N₂O",
    effect: "Cattle digestion (enteric fermentation) and manure release methane and nitrous oxide. Each animal emits about a tonne of CO₂e every year.",
  },
  {
    key: "goat", label: "Goats", icon: Beef, img: "/icon/goat.png", field: "goats_count", unit: "head", monthly: false,
    factorUnit: "kg CO₂e/head/yr", minMax: 60, gases: "CH₄",
    effect: "Small ruminants also produce methane while digesting, but much less per head than cattle.",
  },
  {
    key: "sheep", label: "Sheep", icon: Beef, img: "/icon/sheep.png", field: "sheep_count", unit: "head", monthly: false,
    factorUnit: "kg CO₂e/head/yr", minMax: 60, gases: "CH₄",
    effect: "Like goats, sheep emit enteric methane at roughly one-seventh of a cow's rate.",
  },
];

type Activity = Record<SourceKey, number>;

// 1 kg LPG delivers about as much useful cooking heat as ~11.5 kg of wood in a traditional chulha.
const SCENARIOS: { name: string; hint: string; apply: (a: Activity) => Activity }[] = [
  { name: "Clean cooking", hint: "Swap firewood for LPG", apply: (a) => ({ ...a, firewood: 0, lpg: a.lpg + a.firewood / 11.5 }) },
  { name: "Rooftop solar", hint: "−60% grid power", apply: (a) => ({ ...a, electricity: a.electricity * 0.4 }) },
  { name: "E-mobility", hint: "−70% petrol", apply: (a) => ({ ...a, petrol: a.petrol * 0.3 }) },
  { name: "Composting", hint: "−60% dumped waste", apply: (a) => ({ ...a, waste: a.waste * 0.4 }) },
  { name: "Unchecked growth", hint: "+50% everything", apply: (a) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v * 1.5])) as Activity },
];

function SourceIcon({ source, size }: { source: Source; size: number }) {
  if (!source.img) return <source.icon size={size * 0.85} />;
  return <img className="lab-icon" src={encodeURI(source.img)} alt="" width={size} height={size} />;
}

const tonnes = (s: Source, value: number, factor: number) => (value * (s.monthly ? 12 : 1) * factor) / 1000;
const roundTo = (v: number, step: number) => Math.round(v / step) * step;

export default function VisualizePage() {
  return <WithVillage>{(v) => <CarbonLab key={v.village_code} village={v} />}</WithVillage>;
}

function CarbonLab({ village }: { village: VillageDetails }) {
  const { data: factorRows } = useEmissionFactors();
  const { data: scene, isLoading: sceneLoading } = useVillageScene(village.village_code);
  const [useReal, setUseReal] = useState(true);
  const realLayout = useReal ? scene ?? null : null;
  const factors = useMemo(() => {
    const f = { ...DEFAULT_FACTORS };
    for (const row of factorRows ?? []) {
      const key = ACTIVITY_KEYS.find(([needle]) => row.activity.toLowerCase().includes(needle))?.[1];
      if (key) f[key] = row.factor;
    }
    return f;
  }, [factorRows]);

  const baseActivity = useMemo(
    () => Object.fromEntries(SOURCES.map((s) => [s.key, num(village[s.field])])) as Activity,
    [village],
  );
  const [activity, setActivity] = useState<Activity>(baseActivity);
  const [focus, setFocus] = useState<SourceKey | null>("firewood");
  const [scenario, setScenario] = useState<string | null>(null);

  const toEmissions = (a: Activity) => Object.fromEntries(SOURCES.map((s) => [s.key, tonnes(s, a[s.key], factors[s.key])])) as Emissions;
  const baseline = useMemo(() => toEmissions(baseActivity), [baseActivity, factors]);
  const emissions = useMemo(() => toEmissions(activity), [activity, factors]);
  const baseTotal = Object.values(baseline).reduce((a, b) => a + b, 0);
  const total = Object.values(emissions).reduce((a, b) => a + b, 0);
  const change = baseTotal > 0 ? ((total - baseTotal) / baseTotal) * 100 : 0;
  const residents = num(village.total_residents);
  const focused = SOURCES.find((s) => s.key === focus);

  const set = (key: SourceKey, value: number) => {
    setActivity((a) => ({ ...a, [key]: value }));
    setScenario(null);
  };

  return (
    <>
      <PageTitle>🧪 Carbon Lab: See What Each Emission Source Does</PageTitle>
      <Badge kind="derived">INTERACTIVE SIMULATION · IPCC TIER-1 FACTORS</Badge>
      <p className="caption lab-intro">
        Move the sliders to change how much of each activity happens in <b>{village.village_name}</b>. The 3D village shows where the gas
        comes from and how it builds up in the atmosphere. Values start from the village survey.
      </p>

      <div className="lab">
        <aside className="lab-panel">
          <div className="lab-panel-head">
            <h4>Emission parameters</h4>
            <button type="button" className="btn-ghost" onClick={() => { setActivity(baseActivity); setScenario(null); }}>
              <RotateCcw size={14} /> Survey values
            </button>
          </div>

          <div className="lab-scenarios">
            {SCENARIOS.map((sc) => (
              <button key={sc.name} type="button" className={`lab-chip ${scenario === sc.name ? "active" : ""}`} title={sc.hint}
                onClick={() => { setActivity(sc.apply(baseActivity)); setScenario(sc.name); }}>
                {sc.name === "Unchecked growth" ? "📈" : <Sprout size={13} />} {sc.name}
              </button>
            ))}
          </div>

          {SOURCES.map((s) => {
            const max = Math.max(s.minMax, baseActivity[s.key] * 3);
            const step = max > 500 ? roundTo(max / 200, 5) || 1 : 1;
            const value = activity[s.key];
            const e = emissions[s.key];
            const delta = e - baseline[s.key];
            return (
              <div key={s.key} className={`lab-param ${focus === s.key ? "active" : ""}`} style={{ "--src": SOURCE_COLORS[s.key] } as CSSProperties}
                onClick={() => setFocus(s.key)}>
                <div className="lab-param-top">
                  <span className="lab-param-name"><SourceIcon source={s} size={18} /> {s.label}</span>
                  <span className="lab-param-t">{fmt(e, 1)} t</span>
                </div>
                <input type="range" min={0} max={max} step={step} value={value} aria-label={`${s.label} (${s.unit})`}
                  onChange={(ev) => set(s.key, Number(ev.target.value))} onFocus={() => setFocus(s.key)} />
                <div className="lab-param-foot">
                  <span>{fmt(value)} {s.unit}</span>
                  {Math.abs(delta) >= 0.05 && (
                    <span className={delta > 0 ? "up" : "down"}>{delta > 0 ? "+" : ""}{fmt(delta, 1)} t vs survey</span>
                  )}
                </div>
              </div>
            );
          })}
        </aside>

        <section className="lab-main">
          <div className="lab-layout-bar">
            <span>
              <MapIcon size={14} />{" "}
              {sceneLoading ? "Loading cadastral layout…"
                : !scene ? <>No cadastral parcels for this village yet. Showing an <b>illustrative village</b>.</>
                : realLayout ? <>
                    <b>Real layout:</b> {fmt(scene.parcel_count)} khasra parcels · {fmt(scene.extent_m[0] / 1000, 1)} × {fmt(scene.extent_m[1] / 1000, 1)} km
                    · built-up {fmt(scene.builtup_est_ha, 1)} ha
                    {scene.landcover_source.startsWith("LULC") ? " (LULC)" : " (estimated, no LULC here)"}
                    {scene.households_per_house > 1 && <> · 1 house = {fmt(scene.households_per_house, 1)} households</>}
                  </>
                : <>Showing the <b>illustrative village</b>.</>}
            </span>
            {scene && (
              <span className="lab-toggle" role="group" aria-label="Village layout">
                <button type="button" className={useReal ? "active" : ""} onClick={() => setUseReal(true)}>Real village</button>
                <button type="button" className={!useReal ? "active" : ""} onClick={() => setUseReal(false)}>Illustrative</button>
              </span>
            )}
          </div>
          <CarbonLabScene emissions={emissions} baseline={baseline} focus={focus} onPick={setFocus} village={realLayout} />

          <div className="lab-share" aria-label="Share of emissions by source">
            {SOURCES.map((s) => total > 0 && emissions[s.key] > 0 && (
              <span key={s.key} style={{ flexGrow: emissions[s.key], background: SOURCE_COLORS[s.key] }}
                title={`${s.label}: ${fmt((emissions[s.key] / total) * 100, 1)}%`} onClick={() => setFocus(s.key)} />
            ))}
          </div>

          <div className="lab-metrics">
            <MetricCard label="Total Emissions" color="#d32f2f" value={`${fmt(total, 1)} t`} sub="t CO₂e / year" />
            <MetricCard label="Change vs Survey" color={change > 0 ? "#d32f2f" : "#2e7d32"}
              value={<span className={change > 0.05 ? "up" : change < -0.05 ? "down" : ""}>{change > 0 ? "+" : ""}{fmt(change, 1)}%</span>}
              sub={`${change > 0 ? "+" : ""}${fmt(total - baseTotal, 1)} t CO₂e / year`} />
            <MetricCard label="Per Capita" color="#f57c00" value={residents > 0 ? `${fmt((total * 1000) / residents, 0)} kg` : "–"} sub="kg CO₂e / person / year" />
            <MetricCard label="Trees to Absorb It" color="#2e7d32" value={<><TreePine size={18} /> {fmt((total * 1000) / TREE_KG_YR)}</>} sub={`at ~${TREE_KG_YR} kg CO₂ per tree / year`} />
          </div>

          {focused && (
            <div className="lab-effect" style={{ "--src": SOURCE_COLORS[focused.key] } as CSSProperties}>
              <div className="lab-effect-head">
                <h4><SourceIcon source={focused} size={24} /> {focused.label}: what happens</h4>
                <span className="lab-gas">{focused.gases}</span>
              </div>
              <p>{focused.effect}</p>
              <div className="formula">
                {fmt(activity[focused.key])} {focused.unit}{focused.monthly ? " × 12" : ""} × {factors[focused.key]} {focused.factorUnit} ÷ 1000
                = <b>{fmt(emissions[focused.key], 2)} t CO₂e/yr</b>
                {total > 0 && <> ({fmt((emissions[focused.key] / total) * 100, 1)}% of the village)</>}
              </div>
              <p className="caption">
                <Fuel size={12} /> Cutting this source by half would save about <b>{fmt(emissions[focused.key] / 2, 1)} t CO₂e</b> a year,
                which is the yearly uptake of ~{fmt((emissions[focused.key] * 500) / TREE_KG_YR)} trees.
              </p>
            </div>
          )}
        </section>

        <FactorPanel villageCode={village.village_code} villageName={village.village_name} focus={focus}
          emissions={emissions} baseline={baseline} />
      </div>
    </>
  );
}
