"use client";

import Link from "next/link";
import { useState } from "react";
import { FileChartColumn, FileText, Home, Lock, LogIn } from "lucide-react";
import { useAuth } from "@/components/AuthContext";
import { useDashboard } from "@/components/DashboardContext";
import { ReportComparison } from "@/components/ReportContents";
import { Alert, Card, PageTitle, WithVillage } from "@/components/ui";
import { advancedReportUrl, downloadFile, errorText, reportPdfUrl } from "@/lib/api";
import type { VillageDetails } from "@/lib/types";

export default function AdvancedReportPage() {
  const { user, ready } = useAuth();
  return (
    <>
      <PageTitle>📊 Advanced Village Report</PageTitle>
      <p>
        A detailed planning PDF for the <b>Pradhan and Gram Panchayat</b>. Its purpose is to help the village
        <b> plan</b> (which sources to tackle first in the Gram Panchayat Development Plan), <b>compare</b> itself with
        its block and the district, <b>act</b> (savings from realistic cuts, practical actions and schemes) and
        <b> track</b> progress after updating the survey data on the dashboard.
      </p>
      {!ready ? (
        <div className="loading">Checking login…</div>
      ) : user ? (
        <WithVillage>{(v) => <Download village={v} />}</WithVillage>
      ) : (
        <Alert kind="info">
          <Lock size={14} /> The Advanced Report is available to <b>village Pradhans</b> (and the admin) after logging in.
          Everyone can download the <Link href="/reports">Basic Report</Link>.
          <Link href="/login" className="btn primary" style={{ marginLeft: 8 }}><LogIn size={16} /> Pradhan login</Link>
        </Alert>
      )}
      <h5 className="card-title section-gap">What is in each report</h5>
      <ReportComparison highlight="advanced" />
    </>
  );
}

function Download({ village }: { village: VillageDetails }) {
  const { user } = useAuth();
  const { allVillages, setSelectedCode, setSelectedBlock } = useDashboard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A Pradhan's own village, when it is on the dashboard and not the one selected.
  const own = user?.village_code && user.village_code !== village.village_code
    ? allVillages.find((x) => x.village_code === user.village_code)
    : undefined;

  async function download() {
    setBusy(true);
    setError(null);
    try {
      await downloadFile(advancedReportUrl(village.village_code), `Advanced_Village_Report_${village.village_code}.pdf`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={`Advanced Report · ${village.village_name}`}>
      <p className="caption">
        About 8 pages, A4: executive summary, full inventory, district emission map, benchmarking, reduction
        opportunities, data quality checks and methodology annex. Choose another village with the selector above.
      </p>
      {own && (
        <p>
          <button className="btn" onClick={() => { setSelectedBlock(own.block_name); setSelectedCode(own.village_code); }}>
            <Home size={16} /> Switch to my village ({own.village_name})
          </button>
        </p>
      )}
      <div className="controls">
        <button className="btn primary" onClick={download} disabled={busy}>
          <FileChartColumn size={16} /> {busy ? "Preparing report…" : "Download Advanced Report (PDF)"}
        </button>
        <a className="btn" href={reportPdfUrl(village.village_code)} download><FileText size={16} /> Basic Report</a>
      </div>
      {error && <Alert kind="error">❌ {error}</Alert>}
    </Card>
  );
}
