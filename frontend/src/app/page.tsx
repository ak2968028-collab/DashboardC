"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight, ArrowUpRight, BookOpen, ExternalLink, FileText, FlaskConical, Info, Map as MapIcon, Newspaper, PenSquare, Search, X,
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

type InsightTab = "sources" | "blocks" | "percapita" | "top";
const INSIGHT_TABS: { key: InsightTab; label: string; note: string }[] = [
  { key: "sources", label: "By source", note: "t CO₂e / yr · click a source to highlight its top-third villages" },
  { key: "blocks", label: "By block", note: "t CO₂e / yr · click a block to filter the map" },
  { key: "percapita", label: "Per person", note: "Villages by kg CO₂e per person · click a range to highlight it" },
  { key: "top", label: "Top villages", note: "Click a village to open it on the map" },
];
const RESOURCE_GROUPS = [
  { key: "guidance", label: "IPCC guidance", icon: BookOpen },
  { key: "project", label: "Methodology & data", icon: FlaskConical },
  { key: "other", label: "Other references", icon: ExternalLink },
] as const;
type HubTab = "resources" | "updates";

/** Villages highlighted on the map; everything else is greyed out. */
interface Focus { id: string; label: string; test: (v: Village) => boolean }

const PC_EDGES = [0, 150, 200, 250, 300, 350, 400, Infinity];
const matches = (q: string, ...texts: (string | undefined)[]) => !q || texts.some((t) => t?.toLowerCase().includes(q));

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

/** Horizontal bars as a list: hover highlights a row, `onPick` makes rows clickable. */
function BarList({ rows, total, color, unit, decimals = 0, active, onPick }: {
  rows: { key: string; label: string; hint?: string; value: number; color?: string }[];
  /** When given, each row also shows its share of this total. */
  total?: number; color: string; unit: string; decimals?: number; active?: string | null; onPick?: (key: string) => void;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="home-barlist">
      {rows.map((r) => {
        const body = (
          <>
            <span className="home-barlist-label">{r.label}{r.hint && <small>{r.hint}</small>}</span>
            <span className="home-barlist-track"><i style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? color }} /></span>
            <span className="home-barlist-val">{fmt(r.value, decimals)} {unit}{total ? <small>{fmt((r.value / total) * 100, 0)}%</small> : null}</span>
            {onPick && <ArrowUpRight size={14} className="home-barlist-go" aria-hidden />}
          </>
        );
        return (
          <li key={r.key} className={active === r.key ? "active" : ""}>
            {onPick ? <button type="button" aria-pressed={active === r.key} onClick={() => onPick(r.key)}>{body}</button> : <div>{body}</div>}
          </li>
        );
      })}
    </ul>
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
  const [topBy, setTopBy] = useState<"total" | "per_capita">("total");
  const [hub, setHub] = useState<HubTab>("resources");
  const [query, setQuery] = useState("");

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
  const topVillages = useMemo(() => {
    const val = (v: Village) => num(topBy === "total" ? v.total_co2e_t_yr : v.per_capita_co2e_kg_yr);
    return [...pool].sort((x, y) => val(y) - val(x)).slice(0, 8).map((v) => ({ key: v.village_code, label: v.village_name, hint: v.block_name, value: val(v) }));
  }, [pool, topBy]);

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
              onOpen={(page) => pickedVillage && openVillage(pickedVillage.village_code, page)} onClose={() => setPicked(null)} />
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

      {/* ── Insights: tabbed chart + clickable highlights ── */}
      <section className="home-section">
        <SectionHead eyebrow="Analysis" title="District Emission Insights" sub="Every row is clickable and updates the map above." />
        <div className="home-insights">
          <div className="home-card home-tabs-card">
            <div className="home-card-bar">
              <div className="home-tabs" role="tablist" aria-label="Insight">
                {INSIGHT_TABS.map((t) => (
                  <button key={t.key} type="button" role="tab" aria-selected={insight === t.key} className={insight === t.key ? "active" : ""}
                    onClick={() => setInsight(t.key)}>{t.label}</button>
                ))}
              </div>
              {insight === "top" ? (
                <div className="home-seg" role="group" aria-label="Rank by">
                  <button type="button" className={topBy === "total" ? "active" : ""} onClick={() => setTopBy("total")}>Total</button>
                  <button type="button" className={topBy === "per_capita" ? "active" : ""} onClick={() => setTopBy("per_capita")}>Per person</button>
                </div>
              ) : <span className="home-card-note">{INSIGHT_TABS.find((t) => t.key === insight)!.note}</span>}
            </div>
            {insight === "sources" && (
              <BarList rows={sectors.map((x) => {
                const src = SOURCES.find((o) => x.sector.toLowerCase().includes(o.key));
                return { key: src?.key ?? x.sector, label: x.sector, value: x.co2e_t_yr, color: src?.color };
              })} total={s.total_co2e_t_yr} color="#7b3f98" unit="t" active={focus?.id.startsWith("src:") ? focus.id.slice(4) : null} onPick={focusSource} />
            )}
            {insight === "blocks" && (
              <BarList rows={blockRows.map((x) => ({ key: x.block_name, label: x.block_name, value: x.total_co2e_t_yr }))} total={s.total_co2e_t_yr}
                color="#c77c33" unit="t" active={block} onPick={(b) => { setBlock(b === block ? ALL_BLOCKS : b); showMap(); }} />
            )}
            {insight === "percapita" && (
              <BarList rows={histogram.map((h) => ({ key: h.key, label: h.range, value: h.villages }))} total={allVillages.length} color="#1565c0"
                unit="villages" active={focus?.id.startsWith("pc:") ? focus.id.slice(3) : null}
                onPick={(key) => {
                  const h = histogram.find((x) => x.key === key)!;
                  toggleFocus({ id: `pc:${key}`, label: `${h.range} per person`, test: (v) => num(v.per_capita_co2e_kg_yr) >= h.lo && num(v.per_capita_co2e_kg_yr) < h.hi });
                }} />
            )}
            {insight === "top" && (
              <>
                <BarList rows={topVillages} color={topBy === "total" ? "#c62828" : "#6a1b9a"} unit={topBy === "total" ? "t" : "kg"} active={picked}
                  onPick={(code) => { setPicked(code); showMap(); }} />
                <p className="home-card-note">{block === ALL_BLOCKS ? "All blocks" : `${block} block`} · {topBy === "total" ? "t CO₂e / yr" : "kg CO₂e per person / yr"} · click to open on the map</p>
              </>
            )}
          </div>
          <div className="home-highlights">
            <button type="button" onClick={() => { setInsight("sources"); const k = SOURCES.find((o) => sectors[0]?.sector.toLowerCase().includes(o.key))?.key; if (k) focusSource(k); }}>
              <span>Largest source</span><b>{sectors[0]?.sector}</b>
              <small>{fmt((sectors[0]?.co2e_t_yr / s.total_co2e_t_yr) * 100, 0)}% of district emissions</small><ArrowUpRight size={15} />
            </button>
            <button type="button" className={block === blockRows[0]?.block_name ? "active" : ""}
              onClick={() => { setInsight("blocks"); setBlock(blockRows[0]?.block_name); showMap(); }}>
              <span>Highest-emitting block</span><b>{blockRows[0]?.block_name}</b>
              <small>{fmt(blockRows[0]?.total_co2e_t_yr)} t CO₂e / year</small><ArrowUpRight size={15} />
            </button>
            <button type="button" onClick={() => setInsight("percapita")}>
              <span>Typical village</span><b>{fmt(s.mean_per_capita_co2e_kg_yr, 0)} kg</b>
              <small>CO₂e per person per year</small><ArrowUpRight size={15} />
            </button>
          </div>
        </div>
      </section>

      {/* ── Learn: video beside one tabbed help hub ── */}
      <section className="home-section tint">
        <SectionHead eyebrow="Learn" title="Resources & Updates" sub="Videos, references and project updates." />
        <div className="home-hub">
          <div className="home-watch"><MiniVideo videos={VIDEOS} /></div>
          <div className="home-card home-hub-card">
            <div className="home-card-bar">
              <div className="home-tabs" role="tablist" aria-label="Resources">
                {([
                  ["resources", "Resources", BookOpen, Object.values(RESOURCES).flat().length],
                  ["updates", "Updates", Newspaper, posts.length],
                ] as const).map(([key, label, Icon, n]) => (
                  <button key={key} type="button" role="tab" aria-selected={hub === key} className={hub === key ? "active" : ""} onClick={() => setHub(key)}>
                    <Icon size={14} /> {label}<span className="home-tab-count">{n}</span>
                  </button>
                ))}
              </div>
              {hub === "updates" ? (
                <div className="home-head-actions">
                  {user?.role === "admin" && <Link href="/blog/new" className="btn primary home-write" aria-label="Write a post"><PenSquare size={14} /></Link>}
                  <Link href="/blog" className="home-view-all">All posts <ArrowRight size={15} /></Link>
                </div>
              ) : (
                <label className="home-search">
                  <Search size={14} aria-hidden />
                  <span className="sr-only">Search</span>
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search resources…" />
                </label>
              )}
            </div>
            <div className="home-hub-body">
              {hub === "resources" && <ResourceList query={query.trim().toLowerCase()} />}
              {hub === "updates" && (posts.length ? (
                <ul className="home-posts">
                  {posts.map((p) => (
                    <li key={p.id}>
                      <Link href={`/blog/${p.slug}`}>
                        <span className="home-post-meta"><span className="home-post-cat">{p.category}</span>{postDate(p)}{!p.published && " · Draft"}</span>
                        <b>{p.title}</b>
                        {p.excerpt && <small>{p.excerpt}</small>}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="home-empty"><Newspaper size={26} /><b>No updates yet</b><p>News and field reports will appear here.</p></div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ResourceList({ query }: { query: string }) {
  const groups = RESOURCE_GROUPS.map((g) => ({
    ...g, items: RESOURCES[g.key].filter((r) => matches(query, r.title, r.note, r.href)),
  })).filter((g) => g.items.length);
  if (!groups.length) return <div className="home-empty"><Search size={22} /><b>No matching resources</b></div>;
  return (
    <div className="home-res-groups">
      {groups.map((g) => (
        <div key={g.key}>
          <span className="home-res-h"><g.icon size={13} /> {g.label}</span>
          {g.items.map((r) => {
            const external = r.href.startsWith("http");
            const body = <><FileText size={16} /><span><b>{r.title}</b><small>{r.note ?? r.href.replace(/^https?:\/\//, "")}</small></span>{external ? <ExternalLink size={13} /> : <ArrowRight size={13} />}</>;
            return external
              ? <a key={r.href} className="home-res" href={r.href} target="_blank" rel="noopener noreferrer">{body}</a>
              : <Link key={r.href} className="home-res" href={r.href}>{body}</Link>;
          })}
        </div>
      ))}
    </div>
  );
}

/** Right-hand panel of the home map: details of the clicked village. */
function VillageInfo({ village: v, level, onOpen, onClose }: { village?: Village; level: string | null; onOpen: (page: string) => void; onClose: () => void }) {
  if (!v) {
    return (
      <aside className="home-info empty">
        <MapIcon size={30} />
        <b>Click a village on the map</b>
        <p>Its emissions, largest sources and population appear here.</p>
      </aside>
    );
  }
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
