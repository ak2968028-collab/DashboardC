"use client";

import type { ReactNode } from "react";
import type { VillageDetails } from "@/lib/types";
import { useDashboard } from "./DashboardContext";

export function PageTitle({ children }: { children: ReactNode }) {
  return <h3 className="page-title">{children}</h3>;
}

export function Badge({ kind, children }: { kind: "observed" | "derived"; children: ReactNode }) {
  return <span className={`badge badge-${kind}`}>{children}</span>;
}

/** Bordered KPI card. */
export function MetricCard({ label, value, sub, color }: { label: string; value: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div className="metric-card" style={color ? { borderLeftColor: color } : undefined}>
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
  const { activeVillage } = useDashboard();
  if (!activeVillage) return <div className="loading">Loading village…</div>;
  return <>{children(activeVillage)}</>;
}
