import {
  BarChart3,
  Beef,
  Bike,
  ClipboardEdit,
  Database,
  FileChartColumn,
  FileText,
  Flame,
  FlaskConical,
  Layers,
  LayoutDashboard,
  Leaf,
  Map,
  Newspaper,
  Scale,
  Settings,
  ShieldCheck,
  Trash2,
  Trophy,
  Users,
  Wheat,
} from "lucide-react";
import type { Role } from "@/lib/types";

export type NavBadgeVariant = "success" | "warning" | "info" | "neutral" | "primary";

export interface NavPage {
  href: string;
  label: string;
  icon: typeof Map;
  needsVillage: boolean;
  /** Only listed for this login role. */
  role?: Role;
  /** Consecutive pages with the same group share one navbar dropdown. */
  group?: "Sectors" | "Analytics" | "Reports" | "Tools" | string;
  /** Listed for everyone, but only usable after logging in (shown with a lock). */
  loginRequired?: boolean;
  /** Clear one-line hint shown in the dropdown and command palette. */
  hint?: string;
  /** Optional badge shown next to label (e.g. "GIS", "3D Sim", "Tier-1"). */
  badge?: string;
  /** Badge visual styling variant. */
  badgeVariant?: NavBadgeVariant;
  /** Accent color for icon background / borders. */
  accentColor?: string;
  /** Search keywords for quick command search. */
  keywords?: readonly string[];
}

export interface NavGroupMeta {
  id: string;
  label: string;
  icon: typeof Map;
  description: string;
  badge?: string;
  columns?: 1 | 2;
  menuWidth?: number;
}

/** Rich metadata describing each navigation group. */
export const NAV_GROUPS: Record<string, NavGroupMeta> = {
  Sectors: {
    id: "Sectors",
    label: "Sectors",
    icon: Layers,
    description: "6 rural environmental & emission sectors surveyed at village resolution",
    badge: "6 Sectors",
    columns: 2,
    menuWidth: 440,
  },
  Analytics: {
    id: "Analytics",
    label: "Analytics",
    icon: BarChart3,
    description: "IPCC Tier-1 modeling, interactive 3D simulations & rankings",
    badge: "Interactive",
    columns: 2,
    menuWidth: 420,
  },
  Reports: {
    id: "Reports",
    label: "Reports",
    icon: FileText,
    description: "Official executive summaries & mitigation action dossiers",
    badge: "PDF Exports",
    columns: 1,
    menuWidth: 280,
  },
  Tools: {
    id: "Tools",
    label: "Tools",
    icon: Settings,
    description: "Field data collection, baseline factors & administration",
    badge: "Admin",
    columns: 1,
    menuWidth: 290,
  },
};

/** Backward-compatible dropdown icons mapping. */
export const GROUP_ICONS: Record<string, typeof Map> = {
  Sectors: Layers,
  Analytics: BarChart3,
  Reports: FileText,
  Tools: Settings,
};

export const PAGES: readonly NavPage[] = [
  // ── Standalone Primary Navigation ──────────────────────────────────────────
  {
    href: "/",
    label: "Overview",
    icon: LayoutDashboard,
    needsVillage: false,
    hint: "District-wide environmental & carbon indicators",
    accentColor: "#1b5e20",
    keywords: ["overview", "home", "dashboard", "district", "summary", "kpi"],
  },
  {
    href: "/map",
    label: "Village Map",
    icon: Map,
    needsVillage: true,
    hint: "Interactive GIS satellite boundaries & spatial overlays",
    accentColor: "#0284c7",
    keywords: ["gis", "map", "satellite", "boundaries", "spatial", "spatial data", "location"],
  },
  {
    href: "/blog",
    label: "Blog",
    icon: Newspaper,
    needsVillage: false,
    hint: "News, field reports and research updates from the project team",
    accentColor: "#0d47a1",
    keywords: ["blog", "news", "updates", "articles", "posts"],
  },

  // ── Sectors: 6 Rural Environmental Domains ─────────────────────────────────
  {
    href: "/demography",
    label: "Demography",
    icon: Users,
    needsVillage: true,
    group: "Sectors",
    hint: "Household census, caste profiles, literacy & population stats",
    badge: "Census",
    badgeVariant: "neutral",
    accentColor: "#7c3aed",
    keywords: ["population", "census", "residents", "households", "literacy", "caste", "demographics"],
  },
  {
    href: "/land-water",
    label: "Land & Water",
    icon: Wheat,
    needsVillage: true,
    group: "Sectors",
    hint: "Land utilization, irrigation sources & water table depths",
    badge: "LULC",
    badgeVariant: "success",
    accentColor: "#059669",
    keywords: ["land", "water", "irrigation", "groundwater", "crops", "agriculture", "forest", "ponds", "wells"],
  },
  {
    href: "/energy",
    label: "Energy",
    icon: Flame,
    needsVillage: true,
    group: "Sectors",
    hint: "Domestic electricity, LPG cylinder usage & clean cooking",
    badge: "Power & Fuel",
    badgeVariant: "warning",
    accentColor: "#d97706",
    keywords: ["electricity", "power", "lpg", "biogas", "solar", "cooking fuel", "kwh", "grid"],
  },
  {
    href: "/transport",
    label: "Transport",
    icon: Bike,
    needsVillage: true,
    group: "Sectors",
    hint: "Vehicle ownership, commuting modes & fuel consumption",
    badge: "Mobility",
    badgeVariant: "info",
    accentColor: "#2563eb",
    keywords: ["vehicles", "cars", "bikes", "tractors", "diesel", "petrol", "commuting", "transport"],
  },
  {
    href: "/waste",
    label: "Waste Management",
    icon: Trash2,
    needsVillage: true,
    group: "Sectors",
    hint: "Solid & liquid waste generation, composting & treatment",
    badge: "Sanitation",
    badgeVariant: "neutral",
    accentColor: "#dc2626",
    keywords: ["solid waste", "plastic", "organic", "sewage", "drainage", "compost", "garbage"],
  },
  {
    href: "/livestock",
    label: "Livestock",
    icon: Beef,
    needsVillage: true,
    group: "Sectors",
    hint: "Indigenous cattle, buffalo, enteric fermentation & manure",
    badge: "Animals",
    badgeVariant: "success",
    accentColor: "#15803d",
    keywords: ["cattle", "cows", "buffalo", "poultry", "manure", "enteric fermentation", "methane", "livestock"],
  },

  // ── Analytics & Simulations ────────────────────────────────────────────────
  {
    href: "/carbon",
    label: "Carbon Emission",
    icon: Leaf,
    needsVillage: true,
    group: "Analytics",
    hint: "IPCC Tier-1 sectoral breakdown (CO₂, CH₄, N₂O in t CO₂e)",
    badge: "IPCC Tier-1",
    badgeVariant: "success",
    accentColor: "#16a34a",
    keywords: ["carbon", "ghg", "greenhouse gas", "co2", "methane", "n2o", "ipcc", "footprint", "emissions"],
  },
  {
    href: "/visualize",
    label: "Carbon Lab 3D",
    icon: FlaskConical,
    needsVillage: true,
    group: "Analytics",
    hint: "Interactive 3D village model & net-zero scenario simulation",
    badge: "3D Sim",
    badgeVariant: "info",
    accentColor: "#4f46e5",
    keywords: ["lab", "3d", "simulation", "scenario", "solar", "biogas", "ev", "net zero", "what if", "visualize"],
  },
  {
    href: "/comparison",
    label: "Village Comparison",
    icon: Scale,
    needsVillage: true,
    group: "Analytics",
    hint: "Cross-village benchmarking across sectors & per capita metrics",
    badge: "Benchmark",
    badgeVariant: "neutral",
    accentColor: "#0284c7",
    keywords: ["compare", "benchmark", "side by side", "contrast", "blocks", "cross comparison"],
  },
  {
    href: "/ranking",
    label: "Village Ranking",
    icon: Trophy,
    needsVillage: false,
    group: "Analytics",
    hint: "Map and table of all villages ranked by emissions, population, land, energy, waste or livestock",
    badge: "Leaderboard",
    badgeVariant: "warning",
    accentColor: "#b45309",
    keywords: ["ranking", "leaderboard", "rank", "top", "per capita", "lowest emission", "greenest"],
  },

  // ── Reports ────────────────────────────────────────────────────────────────
  {
    href: "/reports",
    label: "Basic Report",
    icon: FileText,
    needsVillage: true,
    group: "Reports",
    hint: "Free summary PDF report for community & public access",
    badge: "Free PDF",
    badgeVariant: "success",
    accentColor: "#059669",
    keywords: ["report", "pdf", "download", "summary", "print", "public", "free"],
  },
  {
    href: "/reports/advanced",
    label: "Advanced Report",
    icon: FileChartColumn,
    needsVillage: true,
    group: "Reports",
    loginRequired: true,
    hint: "Detailed planning & mitigation dossier for Pradhans & officials",
    badge: "Planning Pro",
    badgeVariant: "warning",
    accentColor: "#b45309",
    keywords: ["action plan", "pradhan", "official", "detailed", "mitigation", "pdf", "advanced report"],
  },

  // ── Tools & Management ─────────────────────────────────────────────────────
  {
    href: "/settings",
    label: "Settings / Methodology",
    icon: Settings,
    needsVillage: false,
    group: "Tools",
    hint: "Emission factors, IPCC Tier-1 formulas & research citations",
    badge: "Factors",
    badgeVariant: "neutral",
    accentColor: "#64748b",
    keywords: ["settings", "emission factors", "gwp", "methodology", "ipcc", "coefficients", "documentation"],
  },
  {
    href: "/import",
    label: "Excel Data Import",
    icon: Database,
    needsVillage: false,
    role: "admin",
    group: "Tools",
    hint: "Upload & sync survey spreadsheets into Postgres database",
    badge: "Admin",
    badgeVariant: "primary",
    accentColor: "#0f766e",
    keywords: ["upload", "excel", "xlsx", "csv", "batch", "import", "data sync"],
  },
  {
    href: "/supervisor",
    label: "Survey Data Entry",
    icon: ClipboardEdit,
    needsVillage: false,
    role: "supervisor",
    group: "Tools",
    hint: "Enumerator portal for entering field survey responses",
    badge: "Supervisor",
    badgeVariant: "info",
    accentColor: "#7c3aed",
    keywords: ["survey", "field work", "data collection", "entry", "forms", "supervisor"],
  },
  {
    href: "/admin",
    label: "Admin Console",
    icon: ShieldCheck,
    needsVillage: false,
    role: "admin",
    group: "Tools",
    hint: "Manage user accounts, credentials & database controls",
    badge: "Security",
    badgeVariant: "primary",
    accentColor: "#e11d48",
    keywords: ["admin", "users", "passwords", "security", "permissions", "roles", "audit"],
  },
];

/** Fast lookup by exact path. */
export function findNavPage(href: string): NavPage | undefined {
  return PAGES.find((p) => p.href === href);
}

/** Search navigation items by title, hint, group, or keyword. */
export function searchNavPages(query: string, userRole?: Role): NavPage[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return PAGES.filter((p) => {
    if (p.role && p.role !== userRole) return false;
    if (p.label.toLowerCase().includes(q)) return true;
    if (p.hint && p.hint.toLowerCase().includes(q)) return true;
    if (p.group && p.group.toLowerCase().includes(q)) return true;
    if (p.badge && p.badge.toLowerCase().includes(q)) return true;
    if (p.keywords && p.keywords.some((k) => k.toLowerCase().includes(q))) return true;
    return false;
  });
}
