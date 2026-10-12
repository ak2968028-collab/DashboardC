"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ArrowRight, ChevronRight, Download, Home, LayoutDashboard, Menu, PanelLeft, Scale, X } from "lucide-react";
import { useBlocks, reportPdfUrl } from "@/lib/api";
import { fmt } from "@/lib/format";
import { ALL_BLOCKS, useDashboard, villageLabel } from "./DashboardContext";
import { PAGES } from "./nav";

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const page = PAGES.find((p) => p.href === pathname);

  return (
    <div className="layout">
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="sidebar-head">
          <h2><PanelLeft size={20} /> Carbon Dashboard</h2>
          <button className="icon-btn mobile-only" onClick={() => setNavOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <nav>
          {PAGES.map((p) => {
            const active = p.href === pathname;
            return (
              <Link key={p.href} href={p.href} className={`nav-link ${active ? "active" : ""}`} onClick={() => setNavOpen(false)}>
                <p.icon size={16} />
                <span>{p.label}</span>
                {active ? <ArrowRight size={16} className="nav-arrow" /> : <ChevronRight size={16} className="nav-arrow" />}
              </Link>
            );
          })}
        </nav>
        <hr />
        <ActiveVillageInfo />
        <hr />
        <p className="caption">Varanasi Village Carbon Dashboard v2.0<br />M.Tech Research Project<br />Survey of India &amp; IPCC Tier-1</p>
      </aside>
      {navOpen && <div className="backdrop" onClick={() => setNavOpen(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setNavOpen(true)} aria-label="Open menu"><Menu size={22} /></button>
          <div>
            <h1 className="main-title"><LayoutDashboard size={28} strokeWidth={2.2} /> VARANASI DISTRICT — VILLAGE ENVIRONMENT &amp; CARBON DASHBOARD</h1>
            <p className="sub-title">M.Tech Thesis Project: Village-Level Environmental Resource Assessment and Carbon Emission Modeling</p>
          </div>
        </header>
        <GlobalControls />
        {page?.needsVillage && <VillageBanner />}
        <DataGate>{children}</DataGate>
      </main>
    </div>
  );
}

function GlobalControls() {
  const { filteredVillages, selectedBlock, setSelectedBlock, selectedCode, setSelectedCode, activeVillage } = useDashboard();
  const { data: blocks = [] } = useBlocks();

  return (
    <div className="controls">
      <label className="field">
        <span>📍 Select Block</span>
        <select value={selectedBlock} onChange={(e) => setSelectedBlock(e.target.value)}>
          {[ALL_BLOCKS, ...blocks].map((b) => <option key={b}>{b}</option>)}
        </select>
      </label>
      <label className="field grow">
        <span>Select Village</span>
        <select value={selectedCode ?? ""} onChange={(e) => setSelectedCode(e.target.value)}>
          {filteredVillages.map((v) => <option key={v.village_code} value={v.village_code}>{villageLabel(v)}</option>)}
        </select>
      </label>
      <Link href="/comparison" className="btn"><Scale size={16} /> Compare</Link>
      {activeVillage ? (
        <a href={reportPdfUrl(activeVillage.village_code)} className="btn primary" download>
          <Download size={16} /> Report (PDF)
        </a>
      ) : (
        <span className="btn disabled"><Download size={16} /> Report (PDF)</span>
      )}
    </div>
  );
}

function ActiveVillageInfo() {
  const { activeVillage: v } = useDashboard();
  if (!v) return null;
  return (
    <dl className="info-list">
      <div><dt>Active Village</dt><dd>{v.village_name}</dd></div>
      <div><dt>Block</dt><dd>{v.block_name}</dd></div>
      <div><dt>Census Code</dt><dd><code>{v.village_code}</code></dd></div>
      <div><dt>Residents</dt><dd>{fmt(v.total_residents)}</dd></div>
      <div><dt>Total Area</dt><dd>{fmt(v.total_area_ha, 1)} ha</dd></div>
      <div><dt>Total Carbon</dt><dd><b>{fmt(v.total_co2e_t_yr, 1)} t CO₂e/yr</b></dd></div>
      <div><dt>Per Capita</dt><dd>{fmt(v.per_capita_co2e_kg_yr, 1)} kg/yr</dd></div>
    </dl>
  );
}

function VillageBanner() {
  const { activeVillage: v } = useDashboard();
  if (!v) return null;
  return (
    <div className="village-banner">
      <div>
        <span className="banner-name"><Home size={20} /> {v.village_name}</span>
        <span className="banner-meta">
          Block: <b>{v.block_name}</b> | Tehsil: <b>{v.subdistrict}</b> | Code: <b>{v.village_code}</b>
        </span>
      </div>
      <span className="banner-pill">
        🌿 <b>{fmt(v.total_co2e_t_yr, 1)} t CO₂e/yr</b> ({fmt(v.per_capita_co2e_kg_yr, 1)} kg/person)
      </span>
    </div>
  );
}

function DataGate({ children }: { children: ReactNode }) {
  const { loading, error } = useDashboard();
  if (error) return <div className="alert error">❌ Could not reach the API: {error.message}</div>;
  if (loading) return <div className="loading">Loading village database…</div>;
  return <>{children}</>;
}
