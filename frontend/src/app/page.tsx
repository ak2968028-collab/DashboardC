"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, BookOpen, ExternalLink, FileText, FlaskConical, Map as MapIcon, PenSquare, Plus } from "lucide-react";
import { useAuth } from "@/components/AuthContext";
import BlogCard from "@/components/blog/BlogCard";
import { SimpleBarChart } from "@/components/charts";
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

const FAQ = [
  {
    q: "What is a village carbon footprint?",
    a: "It is the total greenhouse gas released in a year by activities in the village — cooking fuel, electricity use, petrol for vehicles, solid waste and livestock — expressed in tonnes of CO₂-equivalent (t CO₂e).",
  },
  {
    q: "How are the emissions calculated?",
    a: "We follow the IPCC 2006 Tier-1 method: each surveyed activity (for example kg of firewood per month) is scaled to a year and multiplied by a standard emission factor. The factors are listed on the Methodology page.",
  },
  {
    q: "What does CO₂-equivalent mean?",
    a: "Different gases warm the climate by different amounts. Methane from livestock and waste, for example, is converted to the amount of CO₂ that would cause the same warming, so all sources can be added together.",
  },
  {
    q: "Why is electricity counted when it is made elsewhere?",
    a: "The power is generated at mostly coal-fired plants, but the village's use causes those emissions. Counting them where electricity is consumed (using the CEA grid factor) shows how saving power helps.",
  },
  {
    q: "Where does the data come from?",
    a: "Village surveys and approved supervisor entries, census and cadastral (khasra) village boundaries, and a land-use / land-cover raster. See Data & Disclaimer for the sources and their limits.",
  },
  {
    q: "What can I do in the Carbon Lab?",
    a: "Change each emission source with sliders or try scenarios such as clean cooking or rooftop solar, and see the effect on a 3D model of the village and on its emission map.",
  },
];

const RESOURCES = {
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
const INSIGHT_TABS: { key: InsightTab; label: string; note: string }[] = [
  { key: "sources", label: "By source", note: "t CO₂e per year, all villages." },
  { key: "blocks", label: "By block", note: "t CO₂e per year. Click a block to filter the map; click again to clear." },
  { key: "percapita", label: "Per person", note: "Number of villages by kg CO₂e per person per year." },
];
const RESOURCE_TABS = [
  { key: "guidance", label: "Guidance", icon: BookOpen },
  { key: "project", label: "Methodology & data", icon: FlaskConical },
  { key: "other", label: "Other", icon: ExternalLink },
] as const;

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
function BarList({ rows, total, color, unit, active, onPick }: {
  rows: { key: string; label: string; value: number }[]; total: number; color: string; unit: string; active?: string; onPick?: (key: string) => void;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="home-barlist">
      {rows.map((r) => {
        const body = (
          <>
            <span className="home-barlist-label">{r.label}</span>
            <span className="home-barlist-track"><i style={{ width: `${(r.value / max) * 100}%`, background: color }} /></span>
            <span className="home-barlist-val">{fmt(r.value)} {unit}<small>{fmt((r.value / total) * 100, 0)}%</small></span>
          </>
        );
        return (
          <li key={r.key} className={active === r.key ? "active" : ""}>
            {onPick ? <button type="button" onClick={() => onPick(r.key)}>{body}</button> : <div>{body}</div>}
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
  const { data: posts = [] } = useBlogPosts(2);
  const [block, setBlock] = useState(ALL_BLOCKS);
  // Livestock is the largest source in almost every village, so the map opens on emission level instead.
  const [colorBy, setColorBy] = useState<ColorBy>("total");
  const [picked, setPicked] = useState<string | null>(null);
  const [insight, setInsight] = useState<InsightTab>("sources");
  const [resTab, setResTab] = useState<keyof typeof RESOURCES>("guidance");
  const [faq, setFaq] = useState<number | null>(0);

  const pool = useMemo(() => (block === ALL_BLOCKS ? allVillages : allVillages.filter((v) => v.block_name === block)), [allVillages, block]);
  const cuts = useMemo(() => ({
    total: terciles(allVillages.map((v) => num(v.total_co2e_t_yr))),
    per_capita: terciles(allVillages.map((v) => num(v.per_capita_co2e_kg_yr))),
  }), [allVillages]);

  const legend: MapClass[] = colorBy === "dominant" ? SOURCES.map((x) => ({ key: x.key, label: x.label, color: x.color })) : LEVELS;
  const classes = useMemo(() => new Map(pool.map((v) => {
    const top = dominant(v);
    const cls = colorBy === "dominant" ? top.key
      : levelOf(num(colorBy === "total" ? v.total_co2e_t_yr : v.per_capita_co2e_kg_yr), cuts[colorBy]);
    const tooltip = `<b>${v.village_name}</b><br>${v.block_name}<br>Total: <b>${fmt(v.total_co2e_t_yr, 1)} t CO₂e/yr</b>`
      + `<br>Per person: ${fmt(v.per_capita_co2e_kg_yr, 0)} kg/yr<br>Largest source: ${top.label}`;
    return [v.village_code, { cls, tooltip }];
  })), [pool, colorBy, cuts]);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const { cls } of classes.values()) c.set(cls, (c.get(cls) ?? 0) + 1);
    return c;
  }, [classes]);


  // Per-capita distribution across all villages (kg CO2e / person / yr).
  const histogram = useMemo(() => {
    const edges = [0, 150, 200, 250, 300, 350, 400, Infinity];
    return edges.slice(0, -1).map((lo, i) => ({
      range: edges[i + 1] === Infinity ? `${lo}+` : `${lo}–${edges[i + 1]}`,
      villages: allVillages.filter((v) => num(v.per_capita_co2e_kg_yr) >= lo && num(v.per_capita_co2e_kg_yr) < edges[i + 1]).length,
    }));
  }, [allVillages]);

  const pickedVillage = allVillages.find((v) => v.village_code === picked);
  const openVillage = (code: string, page = "/carbon") => {
    setSelectedCode(code);
    router.push(page);
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
              <select value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
                {COLOR_BY.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
            <span className="home-filter-count">{fmt(pool.length)} villages</span>
          </div>
          <div className="home-map-split">
            <HomeMap classes={classes} legend={legend} onSelect={setPicked} picked={picked} styleKey={`${block}|${colorBy}|${pool.length}`} />
            <VillageInfo village={pickedVillage} level={pickedVillage ? levelOf(num(pickedVillage.per_capita_co2e_kg_yr), cuts.per_capita) : null}
              onOpen={(page) => pickedVillage && openVillage(pickedVillage.village_code, page)} />
          </div>
          <div className="home-legend">
            <b>{COLOR_BY.find((c) => c.key === colorBy)!.label}:</b>
            {legend.map((l) => (
              <span key={l.key}><i style={{ background: l.color }} />{l.label} <small>({fmt(counts.get(l.key) ?? 0)})</small></span>
            ))}
          </div>
          <p className="home-note">
            Emissions follow IPCC 2006 Tier-1 factors applied to surveyed activity data.
            {colorBy !== "dominant" && " Levels split all district villages into thirds."} Village boundaries come from cadastral
            (khasra) maps where available and census boundaries elsewhere.
          </p>
        </div>
      </section>

      {/* ── Insights: one tabbed panel ── */}
      <section className="home-section">
        <SectionHead eyebrow="Analysis" title="District Emission Insights" sub="Key figures from the village inventory. Click a block to show it on the map." />
        <div className="home-insights">
          <div className="home-card home-tabs-card">
            <div className="home-tabs" role="tablist" aria-label="Insight">
              {INSIGHT_TABS.map((t) => (
                <button key={t.key} type="button" role="tab" aria-selected={insight === t.key} className={insight === t.key ? "active" : ""}
                  onClick={() => setInsight(t.key)}>{t.label}</button>
              ))}
            </div>
            {insight === "sources" && (
              <BarList rows={sectors.map((x) => ({ key: x.sector, label: x.sector, value: x.co2e_t_yr }))} total={s.total_co2e_t_yr} color="#7b3f98" unit="t" />
            )}
            {insight === "blocks" && (
              <BarList rows={blockRows.map((x) => ({ key: x.block_name, label: x.block_name, value: x.total_co2e_t_yr }))} total={s.total_co2e_t_yr}
                color="#c77c33" unit="t" active={block} onPick={(b) => { setBlock(b === block ? ALL_BLOCKS : b); document.querySelector(".home-map-split")?.scrollIntoView({ behavior: "smooth", block: "center" }); }} />
            )}
            {insight === "percapita" && (
              <SimpleBarChart data={histogram} category="range" series={[{ key: "villages", name: "Villages", color: "#1565c0" }]} decimals={0} height={230} />
            )}
            <p className="home-card-sub">{INSIGHT_TABS.find((t) => t.key === insight)!.note}</p>
          </div>
          <dl className="home-highlights">
            <div><dt>Largest source</dt><dd>{sectors[0]?.sector}</dd><small>{fmt((sectors[0]?.co2e_t_yr / s.total_co2e_t_yr) * 100, 0)}% of district emissions</small></div>
            <div><dt>Highest-emitting block</dt><dd>{blockRows[0]?.block_name}</dd><small>{fmt(blockRows[0]?.total_co2e_t_yr)} t CO₂e / year</small></div>
            <div><dt>Typical village</dt><dd>{fmt(s.mean_per_capita_co2e_kg_yr, 0)} kg</dd><small>CO₂e per person per year</small></div>
          </dl>
        </div>
      </section>

      {/* ── Updates · Watch · Resources · FAQ in one row ── */}
      <section className="home-section tint">
        <div className="home-quad">
          <div>
            <SectionHead eyebrow="Blog" title="Recent Updates" sub="News and field reports."
              action={<>
                {user?.role === "admin" && <Link href="/blog/new" className="btn primary home-write" aria-label="Write a post"><PenSquare size={14} /></Link>}
                <Link href="/blog" className="home-view-all">All <ArrowRight size={15} /></Link>
              </>} />
            {posts.length ? (
              <div className="home-quad-posts">{posts.slice(0, 2).map((p) => <BlogCard key={p.id} post={p} />)}</div>
            ) : (
              <div className="blog-empty small"><p>No updates published yet.</p></div>
            )}
          </div>
          <div>
            <SectionHead eyebrow="Video" title="Watch" sub="Carbon in motion." />
            <div className="home-watch"><MiniVideo videos={VIDEOS} /></div>
          </div>
          <div>
            <SectionHead eyebrow="Library" title="Resources" sub="Guidance and references." />
            <div className="home-card home-tabs-card">
              <div className="home-tabs" role="tablist" aria-label="Resources">
                {RESOURCE_TABS.map((t) => (
                  <button key={t.key} type="button" role="tab" aria-selected={resTab === t.key} className={resTab === t.key ? "active" : ""}
                    onClick={() => setResTab(t.key)}><t.icon size={14} /> {t.label}</button>
                ))}
              </div>
              {RESOURCES[resTab].map((r) => {
                const external = r.href.startsWith("http");
                const body = <><FileText size={17} /><span><b>{r.title}</b><small>{"note" in r ? r.note : r.href.replace(/^https?:\/\//, "")}</small></span>{external && <ExternalLink size={14} />}</>;
                return external
                  ? <a key={r.href} className="home-res" href={r.href} target="_blank" rel="noopener noreferrer">{body}</a>
                  : <Link key={r.href} className="home-res" href={r.href}>{body}</Link>;
              })}
            </div>
          </div>
          <div>
            <SectionHead eyebrow="Help" title="FAQ" sub="Common questions." />
            <div className="home-faq">
              {FAQ.map((f, i) => (
                <details key={f.q} open={faq === i} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) setFaq(i); else if (faq === i) setFaq(null); }}>
                  <summary>{f.q}<Plus size={16} aria-hidden /></summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Right-hand panel of the home map: details of the clicked village. */
function VillageInfo({ village: v, level, onOpen }: { village?: Village; level: string | null; onOpen: (page: string) => void }) {
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
