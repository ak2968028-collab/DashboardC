import Link from "next/link";
import { Check, Lock, Minus } from "lucide-react";

/** Report sections: [title, purpose, in basic report?] (every section is in the advanced report). */
export const REPORT_SECTIONS: [string, string, boolean][] = [
  ["Purpose of the report", "Who the report is for and which questions it answers.", true],
  ["Village at a glance", "Residents, households, area and the total and per-person carbon footprint.", true],
  ["Carbon footprint by source", "Tonnes of CO₂e per year from LPG, firewood, electricity, petrol, waste and livestock, with a pie chart.", true],
  ["Location maps (village polygons)", "Varanasi district with all 1,334 village boundaries and the 9 blocks, plus a close-up of the village boundary.", true],
  ["How the numbers are calculated", "Activity × emission factor, in plain language.", true],
  ["Executive summary", "Automatic key findings: priority sources, comparison and rank.", false],
  ["Full village inventory", "Every survey value: demography, land use, water, energy, transport, waste and livestock — per year and per household.", false],
  ["Calculation for each source", "Activity, emission factor and result line by line, so figures can be checked.", false],
  ["District emission map", "All village polygons shaded by emissions per person, showing high- and low-emission clusters.", false],
  ["Benchmarking", "Village vs. its block vs. the district, per person and per source, and the village's rank.", false],
  ["Reduction opportunities", "Savings from 10% and 25% cuts per source, practical actions and relevant government schemes.", false],
  ["Data source & quality checks", "Where the data came from, the last approved Pradhan update, and consistency warnings.", false],
  ["Annex: factors, method & glossary", "Every emission factor with its reference, the IPCC Tier 1 method and key terms.", false],
];

export function ReportComparison({ highlight }: { highlight: "basic" | "advanced" }) {
  return (
    <div className="table-wrap">
      <table className="data-table report-compare">
        <thead>
          <tr>
            <th>Section</th>
            <th>Purpose</th>
            <th className={highlight === "basic" ? "hl" : undefined}>Basic</th>
            <th className={highlight === "advanced" ? "hl" : undefined}>Advanced</th>
          </tr>
        </thead>
        <tbody>
          {REPORT_SECTIONS.map(([title, purpose, basic]) => (
            <tr key={title}>
              <td><b>{title}</b></td>
              <td>{purpose}</td>
              <td className={highlight === "basic" ? "hl" : undefined}>
                {basic ? <Check size={16} className="yes" aria-label="Included" /> : <Minus size={16} className="no" aria-label="Not included" />}
              </td>
              <td className={highlight === "advanced" ? "hl" : undefined}><Check size={16} className="yes" aria-label="Included" /></td>
            </tr>
          ))}
          <tr>
            <td><b>Who can download</b></td>
            <td>Basic is free for everyone. Advanced needs a Pradhan (or admin) login.</td>
            <td className={highlight === "basic" ? "hl" : undefined}>Everyone</td>
            <td className={highlight === "advanced" ? "hl" : undefined}>
              <span className="nowrap"><Lock size={13} /> <Link href="/login">Pradhan login</Link></span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
