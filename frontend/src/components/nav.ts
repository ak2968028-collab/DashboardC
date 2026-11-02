import {
  Beef, Bike, ClipboardEdit, Database, FileChartColumn, FileText, Flame, FlaskConical, LayoutDashboard, Leaf, Map, Scale,
  Settings, ShieldCheck, Trash2, Trophy, Users, Wheat,
} from "lucide-react";
import type { Role } from "@/lib/types";

export interface NavPage {
  href: string;
  label: string;
  icon: typeof Map;
  needsVillage: boolean;
  /** Only listed for this login. */
  role?: Role;
  /** Consecutive pages with the same group share one navbar dropdown. */
  group?: string;
  /** Listed for everyone, but only usable after logging in (shown with a lock). */
  loginRequired?: boolean;
  /** One-line hint shown in the dropdown. */
  hint?: string;
}

// Navbar dropdown buttons: group name -> icon.
export const GROUP_ICONS: Record<string, typeof Map> = { Reports: FileText };

export const PAGES: readonly NavPage[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, needsVillage: false },
  { href: "/map", label: "Village Map", icon: Map, needsVillage: true },
  { href: "/demography", label: "Demography", icon: Users, needsVillage: true },
  { href: "/land-water", label: "Land & Water", icon: Wheat, needsVillage: true },
  { href: "/energy", label: "Energy", icon: Flame, needsVillage: true },
  { href: "/transport", label: "Transport", icon: Bike, needsVillage: true },
  { href: "/waste", label: "Waste", icon: Trash2, needsVillage: true },
  { href: "/livestock", label: "Livestock", icon: Beef, needsVillage: true },
  { href: "/carbon", label: "Carbon Emission", icon: Leaf, needsVillage: true },
  { href: "/visualize", label: "Carbon Lab", icon: FlaskConical, needsVillage: true },
  { href: "/comparison", label: "Village Comparison", icon: Scale, needsVillage: true },
  { href: "/ranking", label: "Village Ranking", icon: Trophy, needsVillage: false },
  { href: "/reports", label: "Basic Report", icon: FileText, needsVillage: true, group: "Reports", hint: "Free summary PDF for everyone" },
  {
    href: "/reports/advanced", label: "Advanced Report", icon: FileChartColumn, needsVillage: true, group: "Reports",
    loginRequired: true, hint: "Detailed planning PDF for Pradhans",
  },
  { href: "/import", label: "Excel Import", icon: Database, needsVillage: false, role: "admin" },
  { href: "/settings", label: "Settings / Methodology", icon: Settings, needsVillage: false },
  { href: "/supervisor", label: "Data Entry", icon: ClipboardEdit, needsVillage: false, role: "supervisor" },
  { href: "/admin", label: "Admin", icon: ShieldCheck, needsVillage: false, role: "admin" },
];
