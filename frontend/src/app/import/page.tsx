"use client";

import { useState, type FormEvent } from "react";
import { Download, Upload } from "lucide-react";
import { RequireRole } from "@/components/AuthContext";
import { Alert, PageTitle } from "@/components/ui";
import { downloadFile, errorText, refreshAll, sendApi } from "@/lib/api";
import type { ImportReport } from "@/lib/types";

export default function ImportPage() {
  return <RequireRole role="admin">{() => <ImportTools />}</RequireRole>;
}

function ImportTools() {
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
      setReport(await sendApi<ImportReport>("POST", "/api/import/excel", body));
      await refreshAll();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle>📥 Survey Excel Import &amp; Database Synchronization</PageTitle>
      <p>Upload a new survey dataset to update village parameters, or download the active survey database.
        This bulk import is admin-only and is applied immediately; supervisor submissions go through <b>Admin › Data approvals</b>.</p>
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
      <button className="btn" onClick={() => downloadFile("/api/export/excel", "Varanasi_Village_Environmental_Database.xlsx").catch((err) => setError(errorText(err)))}>
        <Download size={16} /> Download Full Database as Excel (.xlsx)
      </button>
    </>
  );
}
