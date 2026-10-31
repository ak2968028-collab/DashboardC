"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Download, Home, Leaf, LogIn, LogOut, Menu, Scale, X } from "lucide-react";
import { useBlocks, reportPdfUrl } from "@/lib/api";
import { fmt } from "@/lib/format";
import { useAuth } from "./AuthContext";
import { ALL_BLOCKS, useDashboard, villageLabel } from "./DashboardContext";
import CarbonHero from "./CarbonHero";
import { PAGES } from "./nav";
import SiteHeader from "./SiteHeader";

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const { user, logout } = useAuth();
  const page = PAGES.find((p) => p.href === pathname);
  const pages = PAGES.filter((p) => !p.role || p.role === user?.role);
  // Login and role pages are work areas: no block / village selector.
  const showControls = pathname !== "/login" && !page?.role;

  // Close the mobile menu on route change and keep the active link visible in the scrolling bar.
  useEffect(() => {
    setNavOpen(false);
    navRef.current?.querySelector(".nav-link.active")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  return (
    <div className="layout">
      <SiteHeader />
      <header className={`navbar ${navOpen ? "open" : ""} ${scrolled ? "scrolled" : ""}`}>
        <div className="navbar-head">
          <Link href="/" className="brand">
            <span className="brand-badge"><Leaf size={18} /></span>
            <span className="brand-text">Carbon Dashboard<small>Varanasi District</small></span>
          </Link>
          <button className="icon-btn menu-btn mobile-only" onClick={() => setNavOpen(!navOpen)} aria-label={navOpen ? "Close menu" : "Open menu"} aria-expanded={navOpen}>
            {navOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        <nav ref={navRef}>
          {pages.map((p) => {
            const active = p.href === pathname;
            return (
              <Link key={p.href} href={p.href} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
                <p.icon size={16} />
                <span>{p.label}</span>
              </Link>
            );
          })}
          {user ? (
            <button type="button" className="nav-link nav-auth" onClick={logout} title={`Logged in as ${user.username} (${user.role})`}>
              <LogOut size={16} />
              <span>Log out <small>{user.username}</small></span>
            </button>
          ) : (
            <Link href="/login" className={`nav-link nav-auth ${pathname === "/login" ? "active" : ""}`}>
              <LogIn size={16} />
              <span>Login</span>
            </Link>
          )}
        </nav>
      </header>
      {navOpen && <div className="backdrop" onClick={() => setNavOpen(false)} />}

      <main className="main">
        {(pathname === "/" || pathname === "/carbon") && <CarbonHero />}
        {showControls && <GlobalControls />}
        {page?.needsVillage && <VillageBanner />}
        <DataGate>{children}</DataGate>
        <footer className="footer">
          <ActiveVillageInfo />
          <p className="caption">Varanasi Village Carbon Dashboard v2.0 · M.Tech Research Project · Survey of India &amp; IPCC Tier-1</p>
        </footer>
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
