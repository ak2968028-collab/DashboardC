"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Home,
  Leaf,
  Lock,
  LogIn,
  LogOut,
  MapPin,
  Menu,
  User,
  X,
} from "lucide-react";
import { fmt } from "@/lib/format";
import { useAuth } from "./AuthContext";
import { useDashboard } from "./DashboardContext";
import CarbonHero from "./CarbonHero";
import {
  GROUP_ICONS,
  NAV_GROUPS,
  PAGES,
  type NavPage,
} from "./nav";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import { CensusCode, VillageToolbar } from "./VillageSelector";

// Policy pages linked from the footer: no village controls, and readable while the API is down.
const LEGAL_PATHS = ["/privacy", "/terms", "/disclaimer"];

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const { user, logout } = useAuth();
  const { activeVillage } = useDashboard();

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
  const showControls = pathname !== "/login" && !page?.role && !LEGAL_PATHS.includes(pathname);

  // Close mobile navigation on route change and scroll active link into view
  useEffect(() => {
    setNavOpen(false);
    navRef.current?.querySelector(".nav-link.active")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  // Navbar elevation shadow on scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Escape key and body lock for mobile menu
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
          <Link href="/" className="brand" onClick={() => setNavOpen(false)}>
            <span className="brand-badge"><Leaf size={16} /></span>
            <span className="brand-text">
              Carbon Dashboard
              <small>Varanasi District</small>
            </span>
          </Link>
          <button
            type="button"
            className="icon-btn menu-btn mobile-only"
            onClick={() => setNavOpen(!navOpen)}
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
          >
            {navOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        <nav ref={navRef}>
          {/* Mobile active village banner */}
          {activeVillage && (
            <div className="nav-mobile-village-card mobile-only">
              <div className="nav-mobile-village-head">
                <MapPin size={15} className="nav-village-icon" />
                <span className="nav-mobile-village-title">Active Village: <b>{activeVillage.village_name}</b></span>
              </div>
              <div className="nav-mobile-village-meta">
                <span>Block: <b>{activeVillage.block_name}</b></span>
                <span className="nav-village-co2">{fmt(activeVillage.total_co2e_t_yr, 1)} t CO₂e/yr</span>
              </div>
            </div>
          )}

          {/* Main Navigation Links & Dropdowns */}
          {entries.map((entry) => {
            if (Array.isArray(entry)) {
              return (
                <NavDropdown
                  key={entry[0].group}
                  items={entry}
                  pathname={pathname}
                  loggedIn={!!user}
                  onNavigate={() => setNavOpen(false)}
                />
              );
            }
            const p = entry;
            const active = p.href === pathname;
            return (
              <Link
                key={p.href}
                href={p.href}
                className={`nav-link ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => setNavOpen(false)}
              >
                <span
                  className="nav-link-icon-wrap"
                  style={p.accentColor ? { color: p.accentColor } : undefined}
                >
                  <p.icon size={15} />
                </span>
                <span>{p.label}</span>
                {p.badge && (
                  <span className={`nav-pill-mini ${p.badgeVariant ?? "neutral"}`}>
                    {p.badge}
                  </span>
                )}
              </Link>
            );
          })}

          {/* Active Village Context Pill & User Auth Profile (Right Cluster) */}
          <div className="nav-actions">
            {activeVillage && (
              <Link
                href="/map"
                className="nav-village-pill desktop-only"
                title={`Active Village: ${activeVillage.village_name} (${activeVillage.block_name}) - Click to view on GIS Map`}
              >
                <MapPin size={13} className="nav-village-icon" />
                <span className="nav-village-name">{activeVillage.village_name}</span>
                <span className="nav-village-co2">
                  {fmt(activeVillage.total_co2e_t_yr, 0)} t
                </span>
              </Link>
            )}

            {user ? (
              <div className="nav-user-chip">
                <span className="nav-user-avatar" title={`Logged in as ${user.username}`}>
                  <User size={13} />
                </span>
                <div className="nav-user-info">
                  <span className="nav-user-name">{user.username}</span>
                  <span className="nav-user-role">{user.role}</span>
                </div>
                <button
                  type="button"
                  className="nav-logout-btn"
                  onClick={logout}
                  title="Log out"
                  aria-label="Log out"
                >
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className={`nav-link nav-auth ${pathname === "/login" ? "active" : ""}`}
                onClick={() => setNavOpen(false)}
              >
                <LogIn size={14} />
                <span>Sign In</span>
              </Link>
            )}
          </div>
        </nav>
      </header>

      {navOpen && <div className="backdrop" onClick={() => setNavOpen(false)} />}

      <main className="main">
        {(pathname === "/" || pathname === "/carbon") && <CarbonHero />}
        {showControls && <VillageToolbar />}
        {page?.needsVillage && <VillageBanner />}
        {LEGAL_PATHS.includes(pathname) ? children : <DataGate>{children}</DataGate>}
      </main>
      <SiteFooter />
    </div>
  );
}

/** Rich interactive mega-dropdown menu for navigation groups with responsive desktop & mobile support. */
function NavDropdown({
  items,
  pathname,
  loggedIn,
  onNavigate,
}: {
  items: NavPage[];
  pathname: string;
  loggedIn: boolean;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [inline, setInline] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 340 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const label = items[0].group!;
  const groupMeta = NAV_GROUPS[label];
  const Icon = groupMeta?.icon ?? GROUP_ICONS[label] ?? items[0].icon;
  const active = items.some((i) => i.href === pathname);
  const defaultWidth = groupMeta?.menuWidth ?? 340;
  const columns = groupMeta?.columns ?? 1;

  const place = () => {
    const isMobile = window.matchMedia("(max-width: 860px)").matches;
    setInline(isMobile);
    if (!isMobile && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      const actualWidth = Math.min(defaultWidth, window.innerWidth - 24);
      // Align with button or clamp within screen bounds
      const left = Math.max(12, Math.min(r.left - 20, window.innerWidth - actualWidth - 12));
      setPos({ top: r.bottom + 8, left, width: actualWidth });
    }
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
        className={`nav-link nav-dropdown-btn ${active ? "active" : ""} ${open ? "dropdown-open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          place();
          setOpen(!open);
        }}
      >
        <Icon size={15} />
        <span>{label}</span>
        <ChevronDown size={13} className={`nav-chevron ${open ? "open" : ""}`} />
      </button>

      {open &&
        (() => {
          const menu = (
            <div
              ref={menuRef}
              className={`nav-mega-menu ${inline ? "inline" : ""} ${columns === 2 ? "two-col" : ""}`}
              role="menu"
              aria-label={label}
              style={
                inline
                  ? undefined
                  : ({
                      top: pos.top,
                      left: pos.left,
                      width: pos.width,
                      maxWidth: "calc(100vw - 24px)",
                    } as CSSProperties)
              }
            >
              {/* Group Header */}
              {!inline && (
                <div className="nav-mega-header">
                  <div className="nav-mega-header-title">
                    <span className="nav-mega-icon-box">
                      <Icon size={16} />
                    </span>
                    <span className="nav-mega-label">{groupMeta?.label ?? label}</span>
                    {groupMeta?.badge && <span className="nav-group-pill">{groupMeta.badge}</span>}
                  </div>
                  {groupMeta?.description && (
                    <p className="nav-mega-desc">{groupMeta.description}</p>
                  )}
                </div>
              )}

              {/* Cards Grid */}
              <div className={`nav-mega-grid ${columns === 2 ? "cols-2" : "cols-1"}`}>
                {items.map((i) => {
                  const isCurrent = i.href === pathname;
                  return (
                    <Link
                      key={i.href}
                      href={i.href}
                      role="menuitem"
                      className={`nav-card-item ${isCurrent ? "active" : ""}`}
                      onClick={() => {
                        setOpen(false);
                        onNavigate?.();
                      }}
                    >
                      <span
                        className="nav-card-icon"
                        style={
                          i.accentColor
                            ? { backgroundColor: `${i.accentColor}15`, color: i.accentColor }
                            : undefined
                        }
                      >
                        <i.icon size={18} />
                      </span>
                      <div className="nav-card-content">
                        <div className="nav-card-title-row">
                          <span className="nav-card-title">{i.label}</span>
                          {i.badge && (
                            <span className={`nav-badge-tag ${i.badgeVariant ?? "neutral"}`}>
                              {i.badge}
                            </span>
                          )}
                        </div>
                        {i.hint && <p className="nav-card-hint">{i.hint}</p>}
                      </div>
                      {i.loginRequired && !loggedIn && (
                        <span className="nav-card-lock" title="Login required to view">
                          <Lock size={13} />
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>

              {/* Footer hint on desktop */}
              {!inline && (
                <div className="nav-mega-footer">
                  <small>💡 Select any sector or scenario to inspect village resolution data</small>
                </div>
              )}
            </div>
          );
          return inline ? menu : createPortal(menu, document.body);
        })()}
    </>
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
