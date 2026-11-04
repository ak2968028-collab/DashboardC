"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { fmt } from "@/lib/format";
import { useDashboard } from "./DashboardContext";
import { NAV_GROUPS, type NavPage } from "./nav";
import { CensusCode } from "./VillageSelector";

/** Band at the top of every dashboard page (same look as the home hero): breadcrumb, title and purpose, and for
 *  village pages the active village with its headline figures. */
export default function PageHero({ page }: { page: NavPage }) {
  const { activeVillage: v } = useDashboard();
  const group = page.group ? NAV_GROUPS[page.group]?.label ?? page.group : null;
  const Icon = page.icon;
  return (
    <section className="page-hero">
      <div className="page-hero-inner">
        <nav className="page-crumbs" aria-label="Breadcrumb">
          <Link href="/"><Home size={13} /> Overview</Link>
          {group && <><ChevronRight size={13} aria-hidden /><span>{group}</span></>}
          <ChevronRight size={13} aria-hidden /><b aria-current="page">{page.label}</b>
        </nav>
        <div className="page-hero-row">
          <div className="page-hero-text">
            <h1><span className="page-hero-icon"><Icon size={22} /></span>{page.label}</h1>
            {page.hint && <p>{page.hint}</p>}
          </div>
          {page.needsVillage && v && (
            <dl className="page-hero-stats" aria-label="Active village">
              <div className="village">
                <dt>Active village</dt>
                <dd>{v.village_name}</dd>
                <small>{v.block_name} block · code <CensusCode code={v.village_code} tone="dark" /></small>
              </div>
              <div><dt>t CO₂e / year</dt><dd>{fmt(v.total_co2e_t_yr, 0)}</dd></div>
              <div><dt>kg per person</dt><dd>{fmt(v.per_capita_co2e_kg_yr, 0)}</dd></div>
              <div><dt>Residents</dt><dd>{fmt(v.total_residents)}</dd></div>
            </dl>
          )}
        </div>
      </div>
    </section>
  );
}
