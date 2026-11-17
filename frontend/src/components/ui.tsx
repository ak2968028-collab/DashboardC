"use client";

import type { CSSProperties, ReactNode } from "react";
import type { VillageDetails } from "@/lib/types";
import { useDashboard } from "./DashboardContext";

/** Section heading under the page hero; a leading emoji in plain-text titles is dropped for the cleaner look. */
export function PageTitle({ children }: { children: ReactNode }) {
  const text = typeof children === "string" ? children.replace(/^[^\p{L}\p{N}]+/u, "") : children;
  return <h2 className="page-title">{text}</h2>;
}

export function Badge({ kind, children }: { kind: "observed" | "derived"; children: ReactNode }) {
  return <span className={`badge badge-${kind}`}>{children}</span>;
}

/** Bordered KPI card. */
export function MetricCard({ label, value, sub, color }: { label: string; value: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div className="metric-card" style={color ? ({ borderLeftColor: color, "--accent": color } as CSSProperties) : undefined}>
      <div className="metric-label">{label}</div>
      <div className="metric-val">{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

/** Plain label/value statistic. */
export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-val">{value}</div>
    </div>
  );
}

export function Grid({ cols, children }: { cols: number; children: ReactNode }) {
  return <div className={`grid grid-${cols}`}>{children}</div>;
}

export function Card({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {title && <h5 className="card-title">{title}</h5>}
      {children}
    </section>
  );
}

export function Alert({ kind, children }: { kind: "info" | "success" | "warning" | "error"; children: ReactNode }) {
  return <div className={`alert ${kind}`}>{children}</div>;
}

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  numeric?: boolean;
}

export function DataTable<T>({ rows, columns, rowKey }: { rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={c.numeric ? "num" : undefined}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => (
                <td key={c.key} className={c.numeric ? "num" : undefined}>
                  {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Renders children only once the active village has loaded. */
export function WithVillage({ children }: { children: (v: VillageDetails) => ReactNode }) {
  const { activeVillage, selectedPlace, districtCode, areaLabel } = useDashboard();
  if (!districtCode) {
    return <Alert kind="info">Choose a <b>state</b> and <b>district</b> above, then a village.</Alert>;
  }
  if (selectedPlace && !selectedPlace.survey) {
    return (
      <Alert kind="warning">
        <b>{selectedPlace.village_name}</b>{areaLabel && <> ({areaLabel})</>} has no survey data on the dashboard yet
        {!!selectedPlace.population_2011 && <> · Census 2011 population {selectedPlace.population_2011.toLocaleString()}</>}.
        {" "}Pick a village marked with survey data, or sign in as a village supervisor to submit this village&apos;s data.
      </Alert>
    );
  }
  if (!activeVillage) return <div className="loading">Loading village…</div>;
  return <>{children(activeVillage)}</>;
}
