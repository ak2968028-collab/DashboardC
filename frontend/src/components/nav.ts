import {
  Beef, Bike, ClipboardEdit, Database, FileText, Flame, LayoutDashboard, Leaf, Map, Scale,
  Settings, ShieldCheck, Trash2, Trophy, Users, Wheat,
} from "lucide-react";
import type { Role } from "@/lib/types";

// Pages with a role are only listed for that login; the rest are public.
export const PAGES: readonly { href: string; label: string; icon: typeof Map; needsVillage: boolean; role?: Role }[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, needsVillage: false },
  { href: "/map", label: "Village Map", icon: Map, needsVillage: true },
  { href: "/demography", label: "Demography", icon: Users, needsVillage: true },
  { href: "/land-water", label: "Land & Water", icon: Wheat, needsVillage: true },
  { href: "/energy", label: "Energy", icon: Flame, needsVillage: true },
  { href: "/transport", label: "Transport", icon: Bike, needsVillage: true },
  { href: "/waste", label: "Waste", icon: Trash2, needsVillage: true },
  { href: "/livestock", label: "Livestock", icon: Beef, needsVillage: true },
  { href: "/carbon", label: "Carbon Emission", icon: Leaf, needsVillage: true },
  { href: "/comparison", label: "Village Comparison", icon: Scale, needsVillage: true },
  { href: "/ranking", label: "Village Ranking", icon: Trophy, needsVillage: false },
  { href: "/reports", label: "Reports", icon: FileText, needsVillage: true },
  { href: "/import", label: "Excel Import", icon: Database, needsVillage: false, role: "admin" },
  { href: "/settings", label: "Settings / Methodology", icon: Settings, needsVillage: false },
  { href: "/supervisor", label: "Data Entry", icon: ClipboardEdit, needsVillage: false, role: "supervisor" },
  { href: "/admin", label: "Admin", icon: ShieldCheck, needsVillage: false, role: "admin" },
];
