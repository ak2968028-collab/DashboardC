"use client";

import { FileSpreadsheet, FileText } from "lucide-react";
import { Alert, PageTitle, WithVillage } from "@/components/ui";
import { reportPdfUrl, villageCsvUrl } from "@/lib/api";

export default function ReportsPage() {
  return (
    <WithVillage>
      {(v) => (
        <>
          <PageTitle>📑 Village Environmental &amp; Carbon Report Generator</PageTitle>
          <p>Generate and download the complete academic assessment report for <b>{v.village_name}</b>.</p>
          <div className="split">
            <div>
              <b>Report Contents:</b>
              <ol>
                <li><b>Geographic Profile</b>: Census Code, Block, Sub-district, Coordinates.</li>
                <li><b>Demographics</b>: Total Residents, Households, Sex Ratio.</li>
                <li><b>Land Use &amp; Water Resources</b>: Total area, built-up, agriculture, ponds, canals.</li>
                <li><b>Energy</b>: Monthly LPG, firewood, grid electricity.</li>
                <li><b>Transport &amp; Waste</b>: 2-wheelers, fuel, rural solid waste.</li>
                <li><b>Livestock</b>: Dairy cattle, goats, sheep counts.</li>
                <li><b>Greenhouse Gas Modeling</b>: Comprehensive IPCC Tier-1 and CEA India carbon tables (t CO<sub>2</sub>e/yr).</li>
                <li><b>Methodology &amp; Citations</b>: References for thesis bibliography.</li>
              </ol>
              <div style={{ display: "grid", gap: 10 }}>
                <a className="btn primary block" href={reportPdfUrl(v.village_code)} download>
                  <FileText size={16} /> Download Official PDF Report
                </a>
                <a className="btn block" href={villageCsvUrl(v.village_code)} download>
                  <FileSpreadsheet size={16} /> Export Village Record as CSV
                </a>
              </div>
            </div>
            <div>
              <Alert kind="info">💡 <b>Academic Standard:</b> Formatted strictly in compliance with MoEFCC and IPCC 2006 guidelines.</Alert>
            </div>
          </div>
        </>
      )}
    </WithVillage>
  );
}
