"use client";

import { useMemo, useState, type FormEvent } from "react";
import { RotateCcw, Send } from "lucide-react";
import { fmt } from "@/lib/format";
import type { SubmissionStatus, SurveyField, SurveyValues, VerificationStatus } from "@/lib/types";

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending: "⏳ Waiting for approval",
  approved: "✅ Approved",
  rejected: "❌ Rejected",
};

export function StatusPill({ status }: { status: SubmissionStatus }) {
  return <span className={`status-pill ${status}`}>{STATUS_LABELS[status]}</span>;
}

const VERIFICATION_LABELS: Record<VerificationStatus, [string, string]> = {
  unverified: ["Village not chosen", "unverified"],
  pending: ["⏳ Waiting for verification", "pending"],
  verified: ["✅ Verified", "approved"],
  rejected: ["❌ Not verified", "rejected"],
};

export function VerificationPill({ status }: { status: VerificationStatus | null }) {
  if (!status) return <>—</>;
  const [label, style] = VERIFICATION_LABELS[status];
  return <span className={`status-pill ${style}`}>{label}</span>;
}

export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

const fmtValue = (f: SurveyField, v: number | null | undefined) => (v == null ? "—" : fmt(v, f.integer ? 0 : 2));

function bySection(fields: SurveyField[]) {
  const sections = new Map<string, SurveyField[]>();
  for (const f of fields) sections.set(f.section, [...(sections.get(f.section) ?? []), f]);
  return [...sections];
}

const toText = (v: number | null | undefined) => (v == null ? "" : String(v));

/** Survey attributes grouped by section, pre-filled with the village's dashboard values. */
export function SurveyForm({ fields, current, busy, onSubmit }: {
  fields: SurveyField[];
  current: SurveyValues | null;
  busy: boolean;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const initial = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, toText(current?.[f.key])])), [fields, current]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const changed = fields.filter((f) => values[f.key].trim() !== initial[f.key]).length;

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit(Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== "")));
  }

  return (
    <form onSubmit={submit}>
      <div className="grid grid-2">
        {bySection(fields).map(([section, sectionFields]) => (
          <section key={section} className="card">
            <h5 className="card-title">{section}</h5>
            <table className="data-table entry-table">
              <thead>
                <tr><th>Attribute</th><th className="num">On dashboard</th><th>New value</th></tr>
              </thead>
              <tbody>
                {sectionFields.map((f) => (
                  <tr key={f.key} className={values[f.key].trim() !== initial[f.key] ? "changed" : undefined}>
                    <td>{f.label} <small className="unit">{f.unit}</small></td>
                    <td className="num">{fmtValue(f, current?.[f.key])}</td>
                    <td>
                      <input
                        type="number" min={0} step={f.integer ? 1 : "any"} inputMode={f.integer ? "numeric" : "decimal"}
                        aria-label={`${f.label} (${f.unit})`} value={values[f.key]}
                        onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      <div className="controls sticky-actions">
        <span className="caption">
          {changed ? <b>{changed} value{changed > 1 ? "s" : ""} changed.</b> : "No changes yet."} Totals (water area,
          livestock, remaining land) are calculated automatically. The dashboard updates only after the admin approves.
        </span>
        <button type="button" className="btn" disabled={!changed || busy} onClick={() => setValues(initial)}>
          <RotateCcw size={16} /> Reset
        </button>
        <button type="submit" className="btn primary" disabled={(!changed && current !== null) || busy}>
          <Send size={16} /> {busy ? "Sending…" : "Send for approval"}
        </button>
      </div>
    </form>
  );
}

/** Dashboard value vs. proposed value for every submitted attribute; changes highlighted. */
export function ValuesDiff({ fields, current, proposed }: {
  fields: SurveyField[];
  current: SurveyValues | null;
  proposed: Record<string, number>;
}) {
  const [onlyChanges, setOnlyChanges] = useState(true);
  const isChanged = (f: SurveyField) => f.key in proposed && proposed[f.key] !== (current?.[f.key] ?? null);
  const rows = fields.filter((f) => (onlyChanges ? isChanged(f) : f.key in proposed));

  return (
    <>
      <label className="radio-row">
        <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} />
        Show only changed values ({fields.filter(isChanged).length})
      </label>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Section</th><th>Attribute</th><th>Unit</th><th className="num">On dashboard</th><th className="num">Proposed</th></tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.key} className={isChanged(f) ? "changed" : undefined}>
                <td>{f.section}</td>
                <td>{f.label}</td>
                <td className="unit">{f.unit}</td>
                <td className="num">{fmtValue(f, current?.[f.key])}</td>
                <td className="num"><b>{fmtValue(f, proposed[f.key])}</b></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="caption">No differences from the dashboard.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Simple tab strip. */
export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id}
          className={`tab ${value === t.id ? "active" : ""}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
