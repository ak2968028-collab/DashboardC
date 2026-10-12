"use client";

import { useState, type FormEvent } from "react";
import { Download, Upload } from "lucide-react";
import { Alert, PageTitle } from "@/components/ui";
import { errorMessage, refreshAll } from "@/lib/api";
import type { ImportReport } from "@/lib/types";

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setReport(null);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/import/excel", { method: "POST", body });
      if (!res.ok) throw new Error(await errorMessage(res));
      setReport(await res.json());
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle>📥 Survey Excel Import &amp; Database Synchronization</PageTitle>
      <p>Upload a new survey dataset to update village parameters, or download the active survey database.</p>
      <form onSubmit={upload} className="controls">
        <label className="field grow">
          <span>Upload Village Survey Excel File (.xlsx)</span>
          <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button className="btn primary" type="submit" disabled={!file || busy}>
          <Upload size={16} /> {busy ? "Importing & re-computing emissions…" : "Import"}
        </button>
      </form>

      {error && <Alert kind="error">❌ Error during import: {error}</Alert>}
      {report && (
        <>
          <Alert kind="success">✅ Excel Import Successful! Inserted: {report.inserted}, Updated: {report.updated}.</Alert>
          {report.warnings.length > 0 && (
            <Alert kind="warning">
              ⚠️ {report.warnings.length} warnings encountered during import.
              <ul>{report.warnings.slice(0, 10).map((w) => <li key={w}>{w}</li>)}</ul>
            </Alert>
          )}
          <Alert kind="success">Greenhouse gas emissions updated successfully for {report.villages_recalculated} villages!</Alert>
        </>
      )}

      <hr />
      <h5 className="card-title">📤 Export Current Survey Database</h5>
      <a className="btn" href="/api/export/excel" download>
        <Download size={16} /> Download Full Database as Excel (.xlsx)
      </a>
    </>
  );
}
