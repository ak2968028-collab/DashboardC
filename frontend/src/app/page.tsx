"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ExternalLink, FileText, FlaskConical, Map as MapIcon, PenSquare, Plus } from "lucide-react";
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

export default function OverviewPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { allVillages, setSelectedCode, showCodes } = useDashboard();
  const { data: s } = useSummary();
  const { data: blocks = [] } = useBlocks();
  const { data: posts = [] } = useBlogPosts(3);
  const [block, setBlock] = useState(ALL_BLOCKS);
  // Livestock is the largest source in almost every village, so the map opens on emission level instead.
  const [colorBy, setColorBy] = useState<ColorBy>("total");
  const rail = useRef<HTMLDivElement>(null);

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

  // Factsheets: the highest-emitting villages of the current filter.
  const factsheets = useMemo(() => [...pool].sort((a, b) => num(b.total_co2e_t_yr) - num(a.total_co2e_t_yr)).slice(0, 12), [pool]);

  // Per-capita distribution across all villages (kg CO2e / person / yr).
  const histogram = useMemo(() => {
    const edges = [0, 150, 200, 250, 300, 350, 400, Infinity];
    return edges.slice(0, -1).map((lo, i) => ({
      range: edges[i + 1] === Infinity ? `${lo}+` : `${lo}–${edges[i + 1]}`,
      villages: allVillages.filter((v) => num(v.per_capita_co2e_kg_yr) >= lo && num(v.per_capita_co2e_kg_yr) < edges[i + 1]).length,
    }));
  }, [allVillages]);

  const openVillage = (code: string, page = "/carbon") => {
    setSelectedCode(code);
    router.push(page);
  };
  const scrollRail = (dir: number) => rail.current?.scrollBy({ left: dir * rail.current.clientWidth * 0.9, behavior: "smooth" });

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
        <h2 className="home-h2">Village Emissions Across Varanasi</h2>
        <p className="home-sub">See where emissions come from and how they vary by village. Click a village to open its emission profile.</p>
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
          <HomeMap classes={classes} legend={legend} onSelect={(code) => openVillage(code)} styleKey={`${block}|${colorBy}|${pool.length}`} />
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

      {/* ── Insights ── */}
      <section className="home-section">
        <h2 className="home-h2">District Emission Insights</h2>
        <p className="home-sub">Key figures from the village inventory.</p>
        <div className="home-charts">
          <div className="home-card">
            <h3>Emissions by Source</h3>
            <p className="home-card-sub">t CO₂e per year, all villages.</p>
            <SimpleBarChart data={sectors} category="sector" series={[{ key: "co2e_t_yr", name: "t CO₂e/yr", color: "#7b3f98" }]}
              horizontal decimals={0} height={300} showValues={false} />
          </div>
          <div className="home-card">
            <h3>Emissions by Block</h3>
            <p className="home-card-sub">t CO₂e per year.</p>
            <SimpleBarChart data={blockRows} category="block_name" series={[{ key: "total_co2e_t_yr", name: "t CO₂e/yr", color: "#c77c33" }]}
              horizontal decimals={0} height={300} showValues={false} />
          </div>
          <div className="home-card">
            <h3>Per-Person Emissions</h3>
            <p className="home-card-sub">Number of villages by kg CO₂e per person per year.</p>
            <SimpleBarChart data={histogram} category="range" series={[{ key: "villages", name: "Villages", color: "#1565c0" }]}
              decimals={0} height={300} />
          </div>
        </div>
      </section>

      {/* ── Factsheets ── */}
      <section className="home-section tint">
        <div className="home-row-head">
          <div>
            <h2 className="home-h2">Explore Village Factsheets</h2>
            <p className="home-sub">The highest-emitting villages{block !== ALL_BLOCKS ? ` in ${block}` : ""}, with their level and largest source.</p>
          </div>
          <div className="home-rail-nav">
            <button type="button" aria-label="Previous villages" onClick={() => scrollRail(-1)}><ArrowLeft size={16} /></button>
            <button type="button" aria-label="Next villages" onClick={() => scrollRail(1)}><ArrowRight size={16} /></button>
          </div>
        </div>
        <div className="home-rail" ref={rail}>
          {factsheets.map((v) => {
            const top = dominant(v);
            const level = levelOf(num(v.per_capita_co2e_kg_yr), cuts.per_capita);
            return (
              <article key={v.village_code} className="home-fact">
                <header>
                  <h3>{v.village_name}</h3>
                  <span className="home-fact-block">{v.block_name}{showCodes ? ` · ${v.village_code}` : ""}</span>
                </header>
                <dl>
                  <div><dt>Total:</dt><dd><b>{fmt(v.total_co2e_t_yr, 0)} t CO₂e/yr</b></dd></div>
                  <div><dt>Per person:</dt><dd><span className={`home-level ${level}`}>{fmt(v.per_capita_co2e_kg_yr, 0)} kg · {level}</span></dd></div>
                  <div><dt>Largest source:</dt><dd><span className="home-source" style={{ background: `${top.color}22`, color: top.color }}>{top.label}</span></dd></div>
                </dl>
                <button type="button" className="home-fact-link" onClick={() => openVillage(v.village_code)}>View details <ArrowRight size={14} /></button>
              </article>
            );
          })}
        </div>
        <Link href="/ranking" className="home-view-all">View all villages <ArrowRight size={16} /></Link>
      </section>

      {/* ── Blog ── */}
      <section className="home-section">
        <div className="home-row-head">
          <div>
            <h2 className="home-h2">Recent Updates</h2>
            <p className="home-sub">News, field reports and research updates from the project team.</p>
          </div>
          {user?.role === "admin" && <Link href="/blog/new" className="btn primary"><PenSquare size={15} /> Write a post</Link>}
        </div>
        {posts.length ? (
          <div className="blog-grid three">{posts.map((p) => <BlogCard key={p.id} post={p} />)}</div>
        ) : (
          <div className="blog-empty small"><p>No updates published yet.</p></div>
        )}
        <Link href="/blog" className="home-view-all">View all updates <ArrowRight size={16} /></Link>
      </section>

      {/* ── Watch ── */}
      <section className="home-section tint">
        <h2 className="home-h2">Watch</h2>
        <p className="home-sub">Carbon in motion — from village smoke to the global atmosphere.</p>
        <div className="home-watch"><MiniVideo videos={VIDEOS} /></div>
      </section>

      {/* ── Resources ── */}
      <section className="home-section">
        <h2 className="home-h2">Resources</h2>
        <p className="home-sub">Guidance, methodology and reference material behind the inventory.</p>
        <div className="home-charts">
          <div className="home-card">
            <h3 className="home-res-h"><BookOpen size={18} /> Guidance Documents</h3>
            {RESOURCES.guidance.map((r) => (
              <a key={r.href} className="home-res" href={r.href} target="_blank" rel="noopener noreferrer">
                <FileText size={18} /><span><b>{r.title}</b><small>{r.note}</small></span>
              </a>
            ))}
          </div>
          <div className="home-card">
            <h3 className="home-res-h"><FlaskConical size={18} /> Methodology &amp; Data</h3>
            {RESOURCES.project.map((r) => (
              <Link key={r.href} className="home-res" href={r.href}>
                <MapIcon size={18} /><span><b>{r.title}</b><small>{r.note}</small></span>
              </Link>
            ))}
          </div>
          <div className="home-card">
            <h3 className="home-res-h"><ExternalLink size={18} /> Other Resources</h3>
            {RESOURCES.other.map((r) => (
              <a key={r.href} className="home-res link" href={r.href} target="_blank" rel="noopener noreferrer">
                <span><b>{r.title}</b><small>{r.href.replace(/^https?:\/\//, "")}</small></span><ExternalLink size={16} />
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="home-section tint">
        <h2 className="home-h2">Frequently Asked Questions</h2>
        <p className="home-sub">About village carbon footprints and this dashboard.</p>
        <div className="home-faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}<Plus size={18} aria-hidden /></summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
