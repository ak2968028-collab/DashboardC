"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Beef,
  Bike,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flame,
  Fuel,
  HelpCircle,
  Info,
  Map as MapIcon,
  RotateCcw,
  Sprout,
  Trash2,
  TreePine,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import CarbonLabScene, { SOURCE_COLORS, type Emissions, type SourceKey } from "@/components/CarbonLabScene";
import MitigationPanel, { DEFAULT_MITIGATION, type MitigationState } from "@/components/MitigationPanel";
import { MetricCard } from "@/components/ui";
import {
  useCensusVillages,
  useDistrictCensusVillages,
  useDistricts,
  useEmissionFactors,
  useStates,
  useSubdistricts,
  useVillage,
  useVillageScene,
  useVillages,
} from "@/lib/api";
import { fmt, num } from "@/lib/format";
import type { NumericKey, Village, VillageDetails } from "@/lib/types";

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
  img?: string;
  field: NumericKey;
  unit: string;
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

const DEFAULT_STATE = 9;
const DEFAULT_DISTRICT = 187;
const DEFAULT_VILLAGE = "208818";

const sameName = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

interface LabLocationProps {
  village: VillageDetails;
  states: { state_code: number; state_name: string }[];
  districts: { district_code: number; district_name: string }[];
  subdistricts: { subdistrict_code: number; subdistrict_name: string }[];
  stateCode: number | null;
  districtCode: number | null;
  subdistrictCode: number | null;
  setStateCode: (code: number | null) => void;
  setDistrictCode: (code: number | null) => void;
  setSubdistrictCode: (code: number | null) => void;
  areaLabel: string;
  surveyedVillages: Village[];
  allVillages: Village[];
  selectedCode: string;
  onSelectVillage: (code: string) => void;
}

export default function VisualizePage() {
  const { data: rawVillages = [] } = useVillages();
  const allVillages = useMemo(
    () => [...rawVillages].sort((a, b) => a.village_name.localeCompare(b.village_name)),
    [rawVillages],
  );

  // Independent location state for Carbon Lab 3D (never depends on GIS Explorer or global toolbar selection).
  const [stateCode, setState] = useState<number | null>(DEFAULT_STATE);
  const [districtCode, setDistrict] = useState<number | null>(DEFAULT_DISTRICT);
  const [subdistrictCode, setSubdistrict] = useState<number | null>(null);
  const [selectedCode, setSelectedCode] = useState<string>(DEFAULT_VILLAGE);

  const { data: states = [] } = useStates();
  const { data: districts = [] } = useDistricts(stateCode);
  const { data: subdistricts = [] } = useSubdistricts(districtCode);
  const subVillages = useCensusVillages(subdistrictCode);
  const districtVillages = useDistrictCensusVillages(subdistrictCode ? null : districtCode);
  const census = subdistrictCode ? subVillages : districtVillages;

  const districtName = districts.find((d) => d.district_code === districtCode)?.district_name;
  const subdistrictName = subdistricts.find((s) => s.subdistrict_code === subdistrictCode)?.subdistrict_name;
  const areaLabel = subdistrictCode
    ? [subdistrictName, districtName].filter(Boolean).join(", ")
    : districtName ?? states.find((s) => s.state_code === stateCode)?.state_name ?? "";

  const censusCodes = useMemo(() => new Set((census.data ?? []).map((c) => c.village_code)), [census.data]);
  const surveyedInArea = useMemo(() => {
    if (!districtCode) return allVillages;
    if (census.isLoading) return [];
    return allVillages.filter(
      (v) => censusCodes.has(v.village_code)
        || (sameName(v.district, districtName) && (!subdistrictCode || sameName(v.subdistrict, subdistrictName))),
    );
  }, [allVillages, censusCodes, census.isLoading, districtCode, districtName, subdistrictCode, subdistrictName]);

  // If the selected block/district has surveyed villages, keep the active 3D village inside it.
  const activeCode = useMemo(() => {
    if (!allVillages.length) return selectedCode;
    if (surveyedInArea.some((v) => v.village_code === selectedCode)) return selectedCode;
    if (surveyedInArea.length > 0) return surveyedInArea[0].village_code;
    if (allVillages.some((v) => v.village_code === selectedCode)) return selectedCode;
    return allVillages[0].village_code;
  }, [allVillages, surveyedInArea, selectedCode]);

  const { data: fetchedVillage } = useVillage(activeCode);
  const lastVillageRef = useRef<VillageDetails | null>(null);
  if (fetchedVillage) lastVillageRef.current = fetchedVillage;
  const village = fetchedVillage ?? lastVillageRef.current;

  const setStateCode = (code: number | null) => { setState(code); setDistrict(null); setSubdistrict(null); };
  const setDistrictCode = (code: number | null) => { setDistrict(code); setSubdistrict(null); };

  useEffect(() => {
    if (allVillages.length && !allVillages.some((v) => v.village_code === selectedCode)) {
      const fallback = allVillages.find((v) => v.village_code === DEFAULT_VILLAGE) ?? allVillages[0];
      if (fallback) setSelectedCode(fallback.village_code);
    }
  }, [allVillages, selectedCode]);

  if (!village) {
    return <div className="loading" style={{ padding: 32 }}>Loading Carbon Lab 3D…</div>;
  }

  return (
    <CarbonLab
      key={village.village_code}
      village={village}
      states={states}
      districts={districts}
      subdistricts={subdistricts}
      stateCode={stateCode}
      districtCode={districtCode}
      subdistrictCode={subdistrictCode}
      setStateCode={setStateCode}
      setDistrictCode={setDistrictCode}
      setSubdistrictCode={setSubdistrict}
      areaLabel={areaLabel}
      surveyedVillages={surveyedInArea}
      allVillages={allVillages}
      selectedCode={activeCode}
      onSelectVillage={setSelectedCode}
    />
  );
}

function CarbonLab({
  village,
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
  surveyedVillages,
  allVillages,
  selectedCode,
  onSelectVillage,
}: LabLocationProps) {

  const { data: factorRows } = useEmissionFactors();
  const { data: scene } = useVillageScene(village.village_code);
  const [useReal, setUseReal] = useState(true);
  const realLayout = useReal ? scene ?? null : null;

  // SCALGO 3-pane UI state
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [rightTab, setRightTab] = useState<"mitigation" | "insight">("mitigation");
  const [showHelp, setShowHelp] = useState(false);
  const [openSections, setOpenSections] = useState({
    location: true,
    scenarios: true,
    sliders: true,
  });

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
  const [mitigation, setMitigation] = useState<MitigationState>(DEFAULT_MITIGATION);

  const toEmissions = (a: Activity) => Object.fromEntries(SOURCES.map((s) => [s.key, tonnes(s, a[s.key], factors[s.key])])) as Emissions;
  const baseline = useMemo(() => toEmissions(baseActivity), [baseActivity, factors]);
  const emissions = useMemo(() => toEmissions(activity), [activity, factors]);
  const total = Object.values(emissions).reduce((a, b) => a + b, 0);
  const focused = SOURCES.find((s) => s.key === focus);

  // Carbon sequestration from trees and clean intervention factors
  const treeSequestered = (mitigation.trees * TREE_KG_YR) / 1000;
  const solarSavings = ((emissions.electricity || 0) * mitigation.solarPct) / 100;
  const biogasSavings = ((emissions.firewood || 0) * mitigation.biogasPct) / 100;
  const compostSavings = ((emissions.waste || 0) * mitigation.compostPct) / 100;
  const evSavings = ((emissions.petrol || 0) * mitigation.evPct) / 100;
  const agriSavings = (((emissions.cow || 0) + (emissions.goat || 0) + (emissions.sheep || 0)) * 0.25 * mitigation.agriPct) / 100;
  const totalAvoided = solarSavings + biogasSavings + compostSavings + evSavings + agriSavings;
  const totalPositiveOffset = totalAvoided + treeSequestered;
  const netEmissions = Math.max(0, total - totalPositiveOffset);

  const set = (key: SourceKey, value: number) => {
    setActivity((a) => ({ ...a, [key]: value }));
    setScenario(null);
  };

  const resetAll = () => {
    setActivity(baseActivity);
    setScenario(null);
    setMitigation(DEFAULT_MITIGATION);
  };

  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const openRightTab = (tab: "mitigation" | "insight") => {
    setRightTab(tab);
    setRightOpen(true);
  };

  return (
    <div className="scalgo-workbench">
      {/* Top Dark Forest-Green Workbench Bar */}
      <header className="scalgo-topbar">
        <div className="scalgo-topbar-left">
          <span className="scalgo-brand-dot" aria-hidden />
          <div className="scalgo-brand-text">
            <span className="scalgo-brand-title">Carbon Lab 3D Workbench</span>
            <span className="scalgo-brand-sub">
              {areaLabel || "Varanasi District"} · {village.village_name}
            </span>
          </div>
        </div>

        <div className="scalgo-topbar-tools" role="toolbar" aria-label="Simulation tools">
          <button
            type="button"
            className={`scalgo-tool-btn ${rightOpen && rightTab === "mitigation" ? "active" : ""}`}
            onClick={() => openRightTab("mitigation")}
            title="Positive Mitigation & Trees"
          >
            <Sprout size={16} />
            <span>Mitigation</span>
          </button>

          <button
            type="button"
            className={`scalgo-tool-btn ${rightOpen && rightTab === "insight" ? "active" : ""}`}
            onClick={() => openRightTab("insight")}
            title="Focused Source Formula & Impact"
          >
            <Info size={16} />
            <span>Source Info</span>
          </button>

          {scene && (
            <button
              type="button"
              className={`scalgo-tool-btn ${useReal ? "active" : ""}`}
              onClick={() => setUseReal((r) => !r)}
              title="Switch between Real Village layout and Illustrative layout"
            >
              <MapIcon size={16} />
              <span>{useReal ? "Real Layout" : "Illustrative"}</span>
            </button>
          )}
        </div>

        <div className="scalgo-topbar-right">
          <button
            type="button"
            className="scalgo-tool-btn"
            onClick={resetAll}
            title="Reset sliders and mitigation to survey values"
          >
            <RotateCcw size={15} />
            <span>Reset</span>
          </button>
          <button
            type="button"
            className={`scalgo-tool-btn ${showHelp ? "active" : ""}`}
            onClick={() => setShowHelp((h) => !h)}
            title="Simulation guide"
          >
            <HelpCircle size={15} />
            <span>Help</span>
          </button>
        </div>
      </header>

      {showHelp && (
        <div className="scalgo-help-banner">
          <span>
            <b>Carbon Lab 3D:</b> Adjust emission sliders or pick scenarios in the <b>Left Panel</b> to see live 3D plumes for <b>{village.village_name}</b>.
            Use the <b>Right Panel</b> for <b>Mitigation &amp; Trees</b> and <b>Source Formulas</b>.
          </span>
          <button type="button" onClick={() => setShowHelp(false)} aria-label="Dismiss help">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 3-Pane Split Workspace */}
      <div className="scalgo-body">
        {/* LEFT PANEL: Parameters, Scenarios & Location */}
        <aside className={`scalgo-panel left scalgo-lab-left ${leftOpen ? "open" : "collapsed"}`} aria-label="Emission Parameters and Location">
          {leftOpen && (
            <div className="scalgo-panel-inner">
              <div className="scalgo-panel-title-bar">
                <span>Location &amp; Parameters</span>
              </div>

              <div className="scalgo-panel-scroll">
                {/* Location Switcher Accordion */}
                  <div className="scalgo-section">
                    <button
                      type="button"
                      className="scalgo-section-head"
                      onClick={() => toggleSection("location")}
                      aria-expanded={openSections.location}
                    >
                      {openSections.location ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span>Location ({village.village_name})</span>
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
                          <span>Selected Village {surveyedVillages.length > 0 ? `(${surveyedVillages.length})` : ""}</span>
                          <select
                            value={selectedCode}
                            disabled={!surveyedVillages.length && !allVillages.length}
                            onChange={(e) => e.target.value && onSelectVillage(e.target.value)}
                          >
                            {surveyedVillages.length > 0 ? (
                              surveyedVillages.map((v) => (
                                <option key={v.village_code} value={v.village_code}>
                                  {v.village_name} ({v.block_name})
                                </option>
                              ))
                            ) : (
                              <>
                                <option value="" disabled>No surveyed villages in this filter</option>
                                {allVillages.map((v) => (
                                  <option key={v.village_code} value={v.village_code}>
                                    {v.village_name} ({v.block_name})
                                  </option>
                                ))}
                              </>
                            )}
                          </select>
                        </label>
                        {districtCode && surveyedVillages.length === 0 && (
                          <div style={{ fontSize: 11.5, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "6px 8px" }}>
                            No surveyed villages in {areaLabel || "this filter"} yet. Choose any surveyed village above.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Quick Scenarios Accordion */}
                  <div className="scalgo-section">
                    <button
                      type="button"
                      className="scalgo-section-head"
                      onClick={() => toggleSection("scenarios")}
                      aria-expanded={openSections.scenarios}
                    >
                      {openSections.scenarios ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span>What-If Scenarios</span>
                    </button>
                    {openSections.scenarios && (
                      <div className="scalgo-section-body">
                        <div className="lab-scenarios" style={{ borderBottom: "none", paddingBottom: 0 }}>
                          {SCENARIOS.map((sc) => (
                            <button
                              key={sc.name}
                              type="button"
                              className={`lab-chip ${scenario === sc.name ? "active" : ""}`}
                              title={sc.hint}
                              onClick={() => { setActivity(sc.apply(baseActivity)); setScenario(sc.name); }}
                            >
                              {sc.name === "Unchecked growth" ? "📈" : <Sprout size={12} />} {sc.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Emission Sliders Accordion */}
                  <div className="scalgo-section">
                    <button
                      type="button"
                      className="scalgo-section-head"
                      onClick={() => toggleSection("sliders")}
                      aria-expanded={openSections.sliders}
                    >
                      {openSections.sliders ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span>Emission Parameters (8)</span>
                    </button>
                    {openSections.sliders && (
                      <div className="scalgo-section-body scalgo-sliders-body">
                        {SOURCES.map((s) => {
                          const max = Math.max(s.minMax, baseActivity[s.key] * 3);
                          const step = max > 500 ? roundTo(max / 200, 5) || 1 : 1;
                          const value = activity[s.key];
                          const e = emissions[s.key];
                          const delta = e - baseline[s.key];
                          return (
                            <div
                              key={s.key}
                              className={`lab-param ${focus === s.key ? "active" : ""}`}
                              style={{ "--src": SOURCE_COLORS[s.key] } as CSSProperties}
                              onClick={() => setFocus(s.key)}
                            >
                              <div className="lab-param-top">
                                <span className="lab-param-name"><SourceIcon source={s} size={17} /> {s.label}</span>
                                <span className="lab-param-t">{fmt(e, 1)} t</span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={max}
                                step={step}
                                value={value}
                                aria-label={`${s.label} (${s.unit})`}
                                onChange={(ev) => set(s.key, Number(ev.target.value))}
                                onFocus={() => setFocus(s.key)}
                              />
                              <div className="lab-param-foot">
                                <span>{fmt(value)} {s.unit}</span>
                                {Math.abs(delta) >= 0.05 && (
                                  <span className={delta > 0 ? "up" : "down"}>
                                    {delta > 0 ? "+" : ""}{fmt(delta, 1)} t vs survey
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

              <div className="scalgo-panel-foot">
                <span>Gross: <b>{fmt(total, 1)} t</b> · Net: <b>{fmt(netEmissions, 1)} t</b></span>
              </div>
            </div>
          )}

          <button
            type="button"
            className="scalgo-collapse-btn right"
            onClick={() => setLeftOpen((o) => !o)}
            aria-label={leftOpen ? "Collapse left panel" : "Expand left panel"}
            title={leftOpen ? "Hide Parameters" : "Show Parameters"}
          >
            {leftOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
        </aside>

        {/* CENTER 3D SCENE STAGE */}
        <main className="scalgo-lab-stage">
          <div className="scalgo-lab-canvas-wrap">
            <CarbonLabScene
              emissions={emissions}
              baseline={baseline}
              focus={focus}
              onPick={setFocus}
              village={realLayout}
              plantedTrees={mitigation.trees}
              netEmissions={netEmissions}
              sequesteredCO2={treeSequestered}
            />
          </div>

          <div className="lab-share scalgo-lab-share" aria-label="Share of emissions by source">
            {SOURCES.map((s) => total > 0 && emissions[s.key] > 0 && (
              <span
                key={s.key}
                style={{ flexGrow: emissions[s.key], background: SOURCE_COLORS[s.key] }}
                title={`${s.label}: ${fmt((emissions[s.key] / total) * 100, 1)}%`}
                onClick={() => setFocus(s.key)}
              />
            ))}
          </div>

          <div className="lab-metrics scalgo-lab-metrics">
            <MetricCard label="Gross Emissions" color="#d32f2f" value={`${fmt(total, 1)} t`} sub="t CO₂e / year (baseline)" />
            <MetricCard
              label="Mitigated & Absorbed"
              color="#2e7d32"
              value={`-${fmt(totalPositiveOffset, 1)} t`}
              sub={`${fmt(totalAvoided, 1)} t clean tech + ${fmt(treeSequestered, 1)} t trees`}
            />
            <MetricCard
              label="Net Emissions"
              color={netEmissions <= 0.05 ? "#1b5e20" : netEmissions < total ? "#f57c00" : "#d32f2f"}
              value={`${fmt(netEmissions, 1)} t`}
              sub={netEmissions <= 0.05 ? "🎉 100% Net Zero achieved!" : "remaining unmitigated"}
            />
            <MetricCard
              label="Trees to Absorb Remainder"
              color="#2e7d32"
              value={<><TreePine size={16} /> {fmt(Math.max(0, Math.ceil((netEmissions * 1000) / TREE_KG_YR)))}</>}
              sub={`at ~${TREE_KG_YR} kg CO₂ / tree / yr`}
            />
          </div>
        </main>

        {/* RIGHT PANEL: Mitigation & Source Insight */}
        <aside className={`scalgo-panel right scalgo-lab-right ${rightOpen ? "open" : "collapsed"}`} aria-label="Mitigation and Source Info Panel">
          <button
            type="button"
            className="scalgo-collapse-btn left"
            onClick={() => setRightOpen((o) => !o)}
            aria-label={rightOpen ? "Collapse right panel" : "Expand right panel"}
            title={rightOpen ? "Hide Right Panel" : "Show Right Panel"}
          >
            {rightOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          {rightOpen && (
            <div className="scalgo-panel-inner">
              <div className="scalgo-panel-tabs">
                <button
                  type="button"
                  className={`scalgo-tab ${rightTab === "mitigation" ? "active" : ""}`}
                  onClick={() => setRightTab("mitigation")}
                >
                  Mitigation
                </button>
                <button
                  type="button"
                  className={`scalgo-tab ${rightTab === "insight" ? "active" : ""}`}
                  onClick={() => setRightTab("insight")}
                >
                  Source Info
                </button>
              </div>

              <div className="scalgo-inspector-scroll">
                {rightTab === "mitigation" && (
                  <MitigationPanel
                    village={village}
                    grossEmissions={emissions}
                    mitigation={mitigation}
                    onChange={setMitigation}
                  />
                )}

                {rightTab === "insight" && (
                  focused ? (
                    <div className="lab-effect" style={{ "--src": SOURCE_COLORS[focused.key] } as CSSProperties}>
                      <div className="lab-effect-head">
                        <h4><SourceIcon source={focused} size={22} /> {focused.label}</h4>
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
                  ) : (
                    <div className="scalgo-empty-inspector">
                      <p>Click any emission slider on the left or a source inside the 3D village to inspect its IPCC Tier-1 formula.</p>
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
