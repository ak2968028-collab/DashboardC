"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Home, Leaf, Lock, LogIn, LogOut, Menu, X } from "lucide-react";
import { fmt } from "@/lib/format";
import { useAuth } from "./AuthContext";
import { useDashboard } from "./DashboardContext";
import CarbonHero from "./CarbonHero";
import { GROUP_ICONS, PAGES, type NavPage } from "./nav";
import SiteHeader from "./SiteHeader";
import { CensusCode, VillageToolbar } from "./VillageSelector";

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const { user, logout } = useAuth();
  const page = PAGES.find((p) => p.href === pathname);
  const pages = PAGES.filter((p) => !p.role || p.role === user?.role);
  // Consecutive pages of one group become a single dropdown entry.
  const entries = pages.reduce<(NavPage | NavPage[])[]>((list, p) => {
    const last = list.at(-1);
    if (p.group && Array.isArray(last) && last[0].group === p.group) last.push(p);
    else list.push(p.group ? [p] : p);
    return list;
  }, []);
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
          {entries.map((entry) => {
            if (Array.isArray(entry)) {
              return <NavDropdown key={entry[0].group} items={entry} pathname={pathname} loggedIn={!!user} />;
            }
            const p = entry;
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
        {showControls && <VillageToolbar />}
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

const MENU_WIDTH = 270;

/** Navbar button with a menu of pages. On wide screens the menu floats, portalled to <body> (the navbar's
 *  mask and backdrop filter would otherwise clip it); in the mobile menu it opens inline below the button. */
function NavDropdown({ items, pathname, loggedIn }: { items: NavPage[]; pathname: string; loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [inline, setInline] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const label = items[0].group!;
  const Icon = GROUP_ICONS[label] ?? items[0].icon;
  const active = items.some((i) => i.href === pathname);

  const place = () => {
    setInline(window.matchMedia("(max-width: 800px)").matches);
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - MENU_WIDTH - 8)) });
  };

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    menuRef.current?.querySelector<HTMLElement>("a")?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`nav-link ${active ? "active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { place(); setOpen(!open); }}
      >
        <Icon size={16} />
        <span>{label}</span>
        <ChevronDown size={14} className={`nav-chevron ${open ? "open" : ""}`} />
      </button>
      {open && (() => {
        const menu = (
          <div ref={menuRef} className={`nav-menu ${inline ? "inline" : ""}`} role="menu" aria-label={label}
            style={inline ? undefined : ({ top: pos.top, left: pos.left, width: MENU_WIDTH } as CSSProperties)}>
            {items.map((i) => (
              <Link key={i.href} href={i.href} role="menuitem" className={`nav-menu-item ${i.href === pathname ? "active" : ""}`}>
                <i.icon size={18} />
                <span>
                  <b>{i.label}</b>
                  {i.hint && <small>{i.hint}</small>}
                </span>
                {i.loginRequired && !loggedIn && <Lock size={14} className="nav-lock" aria-label="Login required" />}
              </Link>
            ))}
          </div>
        );
        return inline ? menu : createPortal(menu, document.body);
      })()}
    </>
  );
}

function ActiveVillageInfo() {
  const { activeVillage: v } = useDashboard();
  if (!v) return null;
  return (
    <dl className="info-list">
      <div><dt>Active Village</dt><dd>{v.village_name}</dd></div>
      <div><dt>Block</dt><dd>{v.block_name}</dd></div>
      <div><dt>Census Code</dt><dd><CensusCode code={v.village_code} /></dd></div>
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
          Block: <b>{v.block_name}</b> | Tehsil: <b>{v.subdistrict}</b> | Code: <CensusCode code={v.village_code} tone="dark" />
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
