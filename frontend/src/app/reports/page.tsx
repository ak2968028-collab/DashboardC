"use client";

import Link from "next/link";
import { FileChartColumn, FileSpreadsheet, FileText } from "lucide-react";
import { ReportComparison } from "@/components/ReportContents";
import { Alert, Card, PageTitle, WithVillage } from "@/components/ui";
import { reportPdfUrl, villageCsvUrl } from "@/lib/api";

export default function BasicReportPage() {
  return (
    <WithVillage>
      {(v) => (
        <>
          <PageTitle>📄 Basic Village Report</PageTitle>
          <div className="split">
            <div>
              <p>
                A short, free PDF summary of <b>{v.village_name}</b> for residents, Gram Sabha members, teachers,
                students and anyone interested in the village.
              </p>
              <p><b>Purpose:</b> it answers three simple questions —</p>
              <ol>
                <li><b>Where is the village and how big is it?</b> District and block map with every village polygon, and the village&apos;s own boundary.</li>
                <li><b>What does the village use?</b> People, land, cooking fuel, electricity, petrol, waste and livestock.</li>
                <li><b>How much greenhouse gas does that produce, and from which sources?</b> Tonnes of CO₂e per year and per person, compared with the district.</li>
              </ol>
              <p>Use it to understand the footprint and to start a conversation about cleaner fuels, saving energy and better waste handling.</p>
            </div>
            <Card title="Download">
              <div className="stack">
                <a className="btn primary block" href={reportPdfUrl(v.village_code)} download>
                  <FileText size={16} /> Download Basic Report (PDF)
                </a>
                <a className="btn block" href={villageCsvUrl(v.village_code)} download>
                  <FileSpreadsheet size={16} /> Export village record (CSV)
                </a>
                <Link className="btn block" href="/reports/advanced">
                  <FileChartColumn size={16} /> Advanced Report (Pradhan login)
                </Link>
                <p className="caption">Choose another village with the selector above. 2 pages, A4, with maps and charts.</p>
              </div>
            </Card>
          </div>
          <h5 className="card-title section-gap">What is in each report</h5>
          <ReportComparison highlight="basic" />
          <Alert kind="info">
            💡 Estimates follow IPCC 2006 Tier 1 and the CEA India grid factor. They are for awareness and planning, not
            for regulatory compliance or carbon-credit claims.
          </Alert>
        </>
      )}
    </WithVillage>
  );
}
