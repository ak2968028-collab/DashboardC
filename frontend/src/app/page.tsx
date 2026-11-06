"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight, ArrowUpRight, BookOpen, ChevronRight, ExternalLink, FileText, FlaskConical, Info, Map as MapIcon, Newspaper, PenSquare, X,
} from "lucide-react";
import { useAuth } from "@/components/AuthContext";
import { postDate } from "@/components/blog/BlogCard";
import { ALL_BLOCKS, useDashboard } from "@/components/DashboardContext";
import type { MapClass } from "@/components/HomeMap";
import MiniVideo, { type VideoItem } from "@/components/MiniVideo";
import { useBlogPosts, useBlocks, useSummary } from "@/lib/api";
import { fmt, num } from "@/lib/format";
import type { NumericKey, Village } from "@/lib/types";

// Leaflet needs the browser window, so the map is client-only.
const HomeMap = dynamic(() => import("@/components/HomeMap"), {
  ssr: false,
  loading: () => <div className="home-map-wrap"><div className="loading home-map-loading">Loading map…</div></div>,
});

// Files in public/vedio/.
const VIDEOS: VideoItem[] = [
  {
    src: "/vedio/gemini_generated_video_86ec48a4.mp4",
    poster: "/vedio/smoke_to_solar_poster.webp",
    title: "From smoke to a green future",
    source: "AI-generated with Google Gemini",
    durationSec: 10,
    loop: true,
    caption: "Smoke and parched land give way to solar farms and green, low-carbon settlements — the change this dashboard helps villages measure and plan.",
  },
  {
    src: "/vedio/vidssave.com Watch One Year Of Carbon Emissions Take Over The Planet 1080P.mp4",
    poster: "/vedio/carbon_year_poster.webp",
    title: "One year of carbon emissions",
    source: "TIME · footage NASA & Getty Images",
    durationSec: 152,
    hasAudio: true,
    caption: "NASA visualisations of a year of carbon dioxide moving through Earth's atmosphere — emissions from every source, villages included, mix into one shared atmosphere.",
  },
];

// Emission sources (village inventory columns) with the Carbon Lab colours.
const SOURCES: { key: string; col: NumericKey; label: string; color: string }[] = [
  { key: "firewood", col: "firewood_co2e_t_yr", label: "Firewood", color: "#8d6e63" },
  { key: "livestock", col: "livestock_co2e_t_yr", label: "Livestock", color: "#ef6c00" },
  { key: "electricity", col: "electricity_co2e_t_yr", label: "Grid electricity", color: "#f9a825" },
  { key: "waste", col: "waste_co2e_t_yr", label: "Solid waste", color: "#8e24aa" },
  { key: "lpg", col: "lpg_co2e_t_yr", label: "LPG", color: "#5c8fd6" },
  { key: "transport", col: "transport_co2e_t_yr", label: "Transport", color: "#e53935" },
];
const LEVELS: MapClass[] = [
  { key: "high", label: "High (top third)", color: "#c62828" },
  { key: "medium", label: "Medium", color: "#fb8c00" },
  { key: "low", label: "Low (bottom third)", color: "#43a047" },
];
type ColorBy = "dominant" | "total" | "per_capita";
const COLOR_BY: { key: ColorBy; label: string }[] = [
  { key: "total", label: "Total emission level" },
  { key: "dominant", label: "Largest emission source" },
  { key: "per_capita", label: "Per-capita emission level" },
];

const dominant = (v: Village) => SOURCES.reduce((a, b) => (num(v[b.col]) > num(v[a.col]) ? b : a));

/** Tercile cut points of a value across villages. */
function terciles(values: number[]): [number, number] {
  const s = [...values].sort((a, b) => a - b);
  return [s[Math.floor(s.length / 3)] ?? 0, s[Math.floor((2 * s.length) / 3)] ?? 0];
}
const levelOf = (v: number, [lo, hi]: [number, number]) => (v >= hi ? "high" : v >= lo ? "medium" : "low");

const RESOURCES: Record<"guidance" | "project" | "other", { title: string; note?: string; href: string }[]> = {
  guidance: [
    { title: "IPCC 2006 Guidelines — Energy (Vol. 2)", note: "Stationary & mobile combustion factors", href: "https://www.ipcc-nggip.iges.or.jp/public/2006gl/vol2.html" },
    { title: "IPCC 2006 Guidelines — AFOLU (Vol. 4)", note: "Livestock enteric fermentation & manure", href: "https://www.ipcc-nggip.iges.or.jp/public/2006gl/vol4.html" },
    { title: "IPCC 2006 Guidelines — Waste (Vol. 5)", note: "Solid waste disposal", href: "https://www.ipcc-nggip.iges.or.jp/public/2006gl/vol5.html" },
  ],
  project: [
    { title: "Methodology & emission factors", note: "Factors used for every village", href: "/settings" },
    { title: "Village reports", note: "Download a PDF summary for any village", href: "/reports" },
    { title: "Data sources & disclaimer", note: "Where the data comes from and its limits", href: "/disclaimer" },
  ],
  other: [
    { title: "CEA CO₂ Baseline Database", href: "https://cea.nic.in/cdm-co2-baseline-database/?lang=en" },
    { title: "Namami Gange (NMCG)", href: "https://nmcg.nic.in" },
    { title: "Central Pollution Control Board", href: "https://cpcb.nic.in" },
    { title: "Ministry of Jal Shakti", href: "https://jalshakti-dowr.gov.in" },
  ],
};

type InsightTab = "sources" | "blocks" | "percapita";
const INSIGHT_TABS: { key: InsightTab; label: string; col: string; unit: string; note: string }[] = [
  { key: "sources", label: "By source", col: "Emission source", unit: "t CO₂e / yr", note: "Select a source to highlight its top-third villages on the map" },
  { key: "blocks", label: "By block", col: "Block", unit: "t CO₂e / yr", note: "Select a block to filter the map" },
  { key: "percapita", label: "Per person", col: "kg CO₂e per person / yr", unit: "Villages", note: "Select a range to highlight those villages on the map" },
];
const RESOURCE_GROUPS = [
  { key: "guidance", label: "IPCC guidance", icon: BookOpen },
  { key: "project", label: "Methodology & data", icon: FlaskConical },
  { key: "other", label: "Other references", icon: ExternalLink },
] as const;

/** Villages highlighted on the map; everything else is greyed out. */
interface Focus { id: string; label: string; test: (v: Village) => boolean }

const PC_EDGES = [0, 150, 200, 250, 300, 350, 400, Infinity];

/** Section heading: small label, title and one-line description, with optional actions on the right. */
function SectionHead({ eyebrow, title, sub, action }: { eyebrow: string; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="home-head">
      <div>
        <span className="home-eyebrow">{eyebrow}</span>
        <h2 className="home-h2">{title}</h2>
        {sub && <p className="home-sub">{sub}</p>}
      </div>
      {action && <div className="home-head-actions">{action}</div>}
    </div>
  );
}

/** Ranked table with an inline share bar; rows are selectable when `onPick` is given. */
function RankTable({ rows, colLabel, unit, total, active, onPick }: {
  rows: { key: string; label: string; value: number; color?: string }[];
  colLabel: string; unit: string; total: number; active?: string | null; onPick: (key: string) => void;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <table className="home-table">
      <thead>
        <tr><th className="rank">#</th><th>{colLabel}</th><th className="bar">Share</th><th className="num">{unit}</th><th className="num pct">%</th><th aria-hidden /></tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.key} className={active === r.key ? "active" : ""} tabIndex={0} aria-selected={active === r.key}
            onClick={() => onPick(r.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(r.key); } }}>
            <td className="rank">{i + 1}</td>
            <td className="name">{r.color && <i style={{ background: r.color }} />}{r.label}</td>
            <td className="bar"><span><b style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? "#0b4a6f" }} /></span></td>
            <td className="num">{fmt(r.value)}</td>
            <td className="num pct">{fmt((r.value / total) * 100, 0)}%</td>
            <td className="go"><ChevronRight size={15} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function OverviewPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { allVillages, setSelectedCode } = useDashboard();
  const { data: s } = useSummary();
  const { data: blocks = [] } = useBlocks();
  const { data: posts = [] } = useBlogPosts(4);
  const [block, setBlock] = useState(ALL_BLOCKS);
  // Livestock is the largest source in almost every village, so the map opens on emission level instead.
  const [colorBy, setColorBy] = useState<ColorBy>("total");
  const [picked, setPicked] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [insight, setInsight] = useState<InsightTab>("sources");

  const pool = useMemo(() => (block === ALL_BLOCKS ? allVillages : allVillages.filter((v) => v.block_name === block)), [allVillages, block]);
  const cuts = useMemo(() => ({
    total: terciles(allVillages.map((v) => num(v.total_co2e_t_yr))),
    per_capita: terciles(allVillages.map((v) => num(v.per_capita_co2e_kg_yr))),
  }), [allVillages]);
  // Top-third cut point of each source across villages.
  const sourceCuts = useMemo(() => new Map(SOURCES.map((x) => [x.key, terciles(allVillages.map((v) => num(v[x.col])))[1]])), [allVillages]);

  const legend: MapClass[] = colorBy === "dominant" ? SOURCES.map((x) => ({ key: x.key, label: x.label, color: x.color })) : LEVELS;
  const classOf = (v: Village) => colorBy === "dominant" ? dominant(v).key
    : levelOf(num(colorBy === "total" ? v.total_co2e_t_yr : v.per_capita_co2e_kg_yr), cuts[colorBy]);
  const classes = useMemo(() => new Map(pool.map((v) => {
    const top = dominant(v);
    const tooltip = `<b>${v.village_name}</b><br>${v.block_name}<br>Total: <b>${fmt(v.total_co2e_t_yr, 1)} t CO₂e/yr</b>`
      + `<br>Per person: ${fmt(v.per_capita_co2e_kg_yr, 0)} kg/yr<br>Largest source: ${top.label}`;
    return [v.village_code, { cls: classOf(v), tooltip }];
  })), [pool, colorBy, cuts]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const { cls } of classes.values()) c.set(cls, (c.get(cls) ?? 0) + 1);
    return c;
  }, [classes]);
  const focusCodes = useMemo(() => focus ? new Set(pool.filter(focus.test).map((v) => v.village_code)) : null, [focus, pool]);

  // Per-capita distribution across all villages (kg CO2e / person / yr).
  const histogram = useMemo(() => PC_EDGES.slice(0, -1).map((lo, i) => {
    const hi = PC_EDGES[i + 1];
    return {
      key: String(lo), lo, hi, range: hi === Infinity ? `${lo}+ kg` : `${lo}–${hi} kg`,
      villages: allVillages.filter((v) => num(v.per_capita_co2e_kg_yr) >= lo && num(v.per_capita_co2e_kg_yr) < hi).length,
    };
  }), [allVillages]);
  // Village count, population-weighted per-person figure and top emitters for the villages in view.
  const overview = useMemo(() => {
    const t = pool.reduce((a, v) => a + num(v.total_co2e_t_yr), 0);
    const people = pool.reduce((a, v) => a + num(v.total_residents), 0);
    const top = [...pool].sort((x, y) => num(y.total_co2e_t_yr) - num(x.total_co2e_t_yr)).slice(0, 5);
    return { total: t, people, perCapita: people ? (t * 1000) / people : 0, top };
  }, [pool]);
  const pickedVillage = allVillages.find((v) => v.village_code === picked);
  const openVillage = (code: string, page = "/carbon") => {
    setSelectedCode(code);
    router.push(page);
  };
  const showMap = () => document.querySelector(".home-map-split")?.scrollIntoView({ behavior: "smooth", block: "center" });
  /** Highlight villages on the map (clicking the active highlight again clears it). */
  const toggleFocus = (f: Focus, scroll = true) => {
    setFocus((cur) => (cur?.id === f.id ? null : f));
    if (scroll && focus?.id !== f.id) showMap();
  };
  const focusSource = (key: string) => {
    const src = SOURCES.find((x) => x.key === key);
    const hi = sourceCuts.get(key) ?? 0;
    if (src) toggleFocus({ id: `src:${key}`, label: `Top third for ${src.label.toLowerCase()}`, test: (v) => num(v[src.col]) >= hi });
  };
  const changeColorBy = (c: ColorBy) => {
    setColorBy(c);
    setFocus((cur) => (cur?.id.startsWith("cls:") ? null : cur));
  };

  if (!s) return <div className="loading">Loading district summary…</div>;
  const sectors = [...s.sector_emissions].sort((a, b) => b.co2e_t_yr - a.co2e_t_yr);
  const blockRows = [...s.block_emissions].sort((a, b) => b.total_co2e_t_yr - a.total_co2e_t_yr);

  return (
    <div className="home">
      {/* ── Hero ── */}
      <section className="home-hero">
        <div className="home-hero-inner">
          <h1>Explore Village Carbon Emissions in Varanasi</h1>
          <p>
            An interactive tool for Pradhans, planners and researchers: village-level greenhouse gas inventories built from
            survey data, cadastral maps and IPCC methods across every block of the district.
          </p>
          <dl className="home-stats">
            <div><dd>{fmt(s.total_villages)}</dd><dt>Villages</dt></div>
            <div><dd>{fmt(s.total_co2e_t_yr / 1000, 0)}k</dd><dt>t CO₂e / year</dt></div>
            <div><dd>{fmt(s.block_emissions.length)}</dd><dt>Blocks</dt></div>
            <div><dd>{fmt(s.mean_per_capita_co2e_kg_yr, 0)}</dd><dt>kg CO₂e per person</dt></div>
          </dl>
          <div className="home-hero-cards">
            <div className="home-hero-card">
              <div>
                <h2>Village Emission Inventory</h2>
                <p>Sector-by-sector emissions, maps and comparisons for each of the {fmt(s.total_villages)} villages.</p>
              </div>
              <Link href="/map" className="home-explore">Explore <ArrowRight size={16} /></Link>
            </div>
            <div className="home-hero-card">
              <div>
                <h2>Carbon Lab 3D</h2>
                <p>Try clean cooking, solar or composting and watch the effect on a 3D model and emission map of the village.</p>
              </div>
              <Link href="/visualize" className="home-explore">Explore <ArrowRight size={16} /></Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Map ── */}
      <section className="home-section tint">
        <SectionHead eyebrow="Explore" title="Village Emissions Across Varanasi" sub="Click a village to see its details on the right." />
        <div className="home-card">
          <div className="home-filters">
            <b>Filter:</b>
            <label className="home-select">
              <span className="sr-only">Block</span>
              <select value={block} onChange={(e) => setBlock(e.target.value)}>
                <option value={ALL_BLOCKS}>All blocks</option>
                {blocks.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <label className="home-select">
              <span className="sr-only">Colour villages by</span>
              <select value={colorBy} onChange={(e) => changeColorBy(e.target.value as ColorBy)}>
                {COLOR_BY.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
            {focus && (
              <button type="button" className="home-focus-chip" onClick={() => setFocus(null)} title="Clear highlight">
                <span className="home-focus-dot" />{focus.label}<b>{fmt(focusCodes?.size ?? 0)}</b><X size={13} />
              </button>
            )}
            <span className="home-filter-count">{fmt(pool.length)} villages</span>
          </div>
          <div className="home-map-split">
            <HomeMap classes={classes} legend={legend} onSelect={setPicked} picked={picked} focus={focusCodes}
              styleKey={`${block}|${colorBy}|${pool.length}|${focus?.id ?? ""}`} />
            <VillageInfo village={pickedVillage} level={pickedVillage ? levelOf(num(pickedVillage.per_capita_co2e_kg_yr), cuts.per_capita) : null}
              onOpen={(page) => pickedVillage && openVillage(pickedVillage.village_code, page)} onClose={() => setPicked(null)}
              empty={<AreaOverview title={block === ALL_BLOCKS ? "Varanasi district" : `${block} block`} villages={pool.length} {...overview} onPick={setPicked} />} />
          </div>
          <div className="home-legend">
            <span className="home-legend-title">{COLOR_BY.find((c) => c.key === colorBy)!.label}</span>
            {legend.map((l) => {
              const id = `cls:${colorBy}:${l.key}`;
              return (
                <button key={l.key} type="button" aria-pressed={focus?.id === id} className={focus?.id === id ? "active" : focus ? "muted" : ""}
                  onClick={() => toggleFocus({ id, label: l.label, test: (v) => classOf(v) === l.key }, false)}>
                  <i style={{ background: l.color }} />{l.label}<small>{fmt(counts.get(l.key) ?? 0)}</small>
                </button>
              );
            })}
            <span className="home-legend-info" tabIndex={0}>
              <Info size={14} /> Method
              <span role="tooltip">
                Emissions follow IPCC 2006 Tier-1 factors applied to surveyed activity data.
                {colorBy !== "dominant" && " Levels split all district villages into thirds."} Village boundaries come from cadastral
                (khasra) maps where available and census boundaries elsewhere.
              </span>
            </span>
          </div>
        </div>
      </section>

      {/* ── Insights: KPI strip + ranked breakdown ── */}
      <section className="home-section">
        <SectionHead eyebrow="Analysis" title="District Emission Insights" sub="Headline figures and a ranked breakdown. Select a row to update the map." />
        <div className="home-card home-insight-card">
          <div className="home-kpis">
            <div className="home-kpi">
              <span>Total emissions</span>
              <b>{fmt(s.total_co2e_t_yr)}<small> t CO₂e / yr</small></b>
              <em>{fmt(s.total_villages)} villages · {fmt(s.block_emissions.length)} blocks</em>
            </div>
            <button type="button" className="home-kpi" onClick={() => { setInsight("sources"); const k = SOURCES.find((o) => sectors[0]?.sector.toLowerCase().includes(o.key))?.key; if (k) focusSource(k); }}>
              <span>Largest source</span>
              <b>{sectors[0]?.sector}</b>
              <em>{fmt((sectors[0]?.co2e_t_yr / s.total_co2e_t_yr) * 100, 0)}% of district total</em>
              <ArrowUpRight size={15} />
            </button>
            <button type="button" className={`home-kpi${block === blockRows[0]?.block_name ? " active" : ""}`}
              onClick={() => { setInsight("blocks"); setBlock(blockRows[0]?.block_name); showMap(); }}>
              <span>Highest-emitting block</span>
              <b>{blockRows[0]?.block_name}</b>
              <em>{fmt(blockRows[0]?.total_co2e_t_yr)} t CO₂e / yr</em>
              <ArrowUpRight size={15} />
            </button>
            <button type="button" className="home-kpi" onClick={() => setInsight("percapita")}>
              <span>Average per person</span>
              <b>{fmt(s.mean_per_capita_co2e_kg_yr, 0)}<small> kg CO₂e / yr</small></b>
              <em>Mean across villages</em>
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="home-insight-body">
            <div className="home-card-bar">
              <div className="home-tabs" role="tablist" aria-label="Breakdown">
                {INSIGHT_TABS.map((t) => (
                  <button key={t.key} type="button" role="tab" aria-selected={insight === t.key} className={insight === t.key ? "active" : ""}
                    onClick={() => setInsight(t.key)}>{t.label}</button>
                ))}
              </div>
              <span className="home-card-note">{INSIGHT_TABS.find((t) => t.key === insight)!.note}</span>
            </div>
            {(() => {
              const t = INSIGHT_TABS.find((x) => x.key === insight)!;
              if (insight === "sources") return (
                <RankTable colLabel={t.col} unit={t.unit} total={s.total_co2e_t_yr}
                  rows={sectors.map((x) => {
                    const src = SOURCES.find((o) => x.sector.toLowerCase().includes(o.key));
                    return { key: src?.key ?? x.sector, label: x.sector, value: x.co2e_t_yr, color: src?.color };
                  })}
                  active={focus?.id.startsWith("src:") ? focus.id.slice(4) : null} onPick={focusSource} />
              );
              if (insight === "blocks") return (
                <RankTable colLabel={t.col} unit={t.unit} total={s.total_co2e_t_yr} active={block}
                  rows={blockRows.map((x) => ({ key: x.block_name, label: x.block_name, value: x.total_co2e_t_yr }))}
                  onPick={(b) => { setBlock(b === block ? ALL_BLOCKS : b); showMap(); }} />
              );
              return (
                <RankTable colLabel={t.col} unit={t.unit} total={allVillages.length}
                  rows={histogram.map((h) => ({ key: h.key, label: h.range, value: h.villages, color: "#3f7cc4" }))}
                  active={focus?.id.startsWith("pc:") ? focus.id.slice(3) : null}
                  onPick={(key) => {
                    const h = histogram.find((x) => x.key === key)!;
                    toggleFocus({ id: `pc:${key}`, label: `${h.range} per person`, test: (v) => num(v.per_capita_co2e_kg_yr) >= h.lo && num(v.per_capita_co2e_kg_yr) < h.hi });
                  }} />
              );
            })()}
          </div>
        </div>
      </section>

      {/* ── Learn: video + resource library ── */}
      <section className="home-section tint">
        <SectionHead eyebrow="Learn" title="Resources & Updates" sub="Background video, the guidance behind the numbers, and project news." />
        <div className="home-hub">
          <div className="home-watch"><MiniVideo videos={VIDEOS} /></div>
          <div className="home-card home-library">
            <div className="home-library-col">
              <ResourceGroup group={RESOURCE_GROUPS[0]} />
              <ResourceGroup group={RESOURCE_GROUPS[1]} />
            </div>
            <div className="home-library-col">
              <ResourceGroup group={RESOURCE_GROUPS[2]} />
              <div className="home-res-group">
                <div className="home-res-h">
                  <span><Newspaper size={13} /> Latest updates</span>
                  <span className="home-res-h-actions">
                    {user?.role === "admin" && <Link href="/blog/new" aria-label="Write a post" title="Write a post"><PenSquare size={13} /></Link>}
                    <Link href="/blog">View all <ArrowRight size={13} /></Link>
                  </span>
                </div>
                {posts.length ? posts.slice(0, 3).map((p) => (
                  <Link key={p.id} href={`/blog/${p.slug}`} className="home-res">
                    <span className="home-res-icon"><Newspaper size={15} /></span>
                    <span className="home-res-text"><b>{p.title}</b><small>{p.category} · {postDate(p)}{!p.published && " · Draft"}</small></span>
                    <ChevronRight size={15} className="home-res-go" />
                  </Link>
                )) : <p className="home-res-empty">No updates published yet. Field reports and news will appear here.</p>}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ResourceGroup({ group: g }: { group: (typeof RESOURCE_GROUPS)[number] }) {
  return (
    <div className="home-res-group">
      <div className="home-res-h"><span><g.icon size={13} /> {g.label}</span></div>
      {RESOURCES[g.key].map((r) => {
        const external = r.href.startsWith("http");
        const body = (
          <>
            <span className="home-res-icon"><FileText size={15} /></span>
            <span className="home-res-text"><b>{r.title}</b><small>{r.note ?? r.href.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}</small></span>
            {external ? <ExternalLink size={14} className="home-res-go" /> : <ChevronRight size={15} className="home-res-go" />}
          </>
        );
        return external
          ? <a key={r.href} className="home-res" href={r.href} target="_blank" rel="noopener noreferrer">{body}</a>
          : <Link key={r.href} className="home-res" href={r.href}>{body}</Link>;
      })}
    </div>
  );
}

/** Default state of the map side panel: totals and top emitters for the villages in view. */
function AreaOverview({ title, villages, total, people, perCapita, top, onPick }: {
  title: string; villages: number; total: number; people: number; perCapita: number; top: Village[]; onPick: (code: string) => void;
}) {
  return (
    <>
      <small>Overview</small>
      <h3>{title}</h3>
      <dl className="home-info-kpis">
        <div><dt>Villages</dt><dd>{fmt(villages)}</dd></div>
        <div><dt>t CO₂e / yr</dt><dd>{fmt(total)}</dd></div>
        <div><dt>Residents</dt><dd>{fmt(people)}</dd></div>
        <div><dt>kg per person</dt><dd>{fmt(perCapita, 0)}</dd></div>
      </dl>
      <b className="home-info-h">Highest-emitting villages</b>
      <ol className="home-info-top">
        {top.map((v) => (
          <li key={v.village_code}>
            <button type="button" onClick={() => onPick(v.village_code)}>
              <span>{v.village_name}</span><em>{fmt(v.total_co2e_t_yr, 0)} t</em><ChevronRight size={14} />
            </button>
          </li>
        ))}
      </ol>
      <p className="home-info-hint"><MapIcon size={14} /> Click any village on the map for its full profile.</p>
    </>
  );
}

/** Right-hand panel of the home map: details of the clicked village. */
function VillageInfo({ village: v, level, onOpen, onClose, empty }: {
  village?: Village; level: string | null; onOpen: (page: string) => void; onClose: () => void; empty: ReactNode;
}) {
  if (!v) return <aside className="home-info">{empty}</aside>;
  const total = num(v.total_co2e_t_yr);
  const rows = SOURCES.map((s) => ({ ...s, t: num(v[s.col]) })).sort((a, b) => b.t - a.t);
  return (
    <aside className="home-info">
      <button type="button" className="home-info-close" onClick={onClose} aria-label="Close village details"><X size={15} /></button>
      <small>{v.block_name} block</small>
      <h3>{v.village_name}</h3>
      <dl className="home-info-kpis">
        <div><dt>t CO₂e / yr</dt><dd>{fmt(total, 0)}</dd></div>
        <div><dt>kg per person</dt><dd>{fmt(v.per_capita_co2e_kg_yr, 0)}{level && <span className={`home-level ${level}`}>{level}</span>}</dd></div>
        <div><dt>Residents</dt><dd>{fmt(v.total_residents)}</dd></div>
        <div><dt>Area</dt><dd>{fmt(v.total_area_ha, 0)} ha</dd></div>
      </dl>
      <b className="home-info-h">Emissions by source</b>
      <ul className="home-info-src">
        {rows.map((r) => (
          <li key={r.key}>
            <span>{r.label}</span>
            <span className="home-info-bar"><i style={{ width: `${total ? (r.t / total) * 100 : 0}%`, background: r.color }} /></span>
            <span>{fmt(r.t, 0)} t</span>
          </li>
        ))}
      </ul>
      <div className="home-info-actions">
        <button type="button" className="btn primary" onClick={() => onOpen("/carbon")}>Emission profile</button>
        <button type="button" className="btn" onClick={() => onOpen("/visualize")}>Carbon Lab 3D</button>
      </div>
    </aside>
  );
}
