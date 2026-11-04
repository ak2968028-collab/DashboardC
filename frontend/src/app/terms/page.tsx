import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of Use · Village Carbon Dashboard" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="4 November 2026">
      <p>By using the Village Environment &amp; Carbon Dashboard you agree to these terms.</p>

      <h2>Purpose</h2>
      <p>
        The dashboard is provided for research, education and village-level planning. Figures are estimates; see the{" "}
        <Link href="/disclaimer">Data &amp; Disclaimer</Link> page before relying on them for decisions.
      </p>

      <h2>Accounts</h2>
      <ul>
        <li>Keep your login details private and sign out on shared computers.</li>
        <li>Only submit village data you collected or are authorised to enter, and enter it as accurately as you can.</li>
        <li>Administrators may review, correct or remove submitted data and suspend accounts that misuse the system.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Do not attempt to disrupt the service, access accounts or data you are not authorised to use, or scrape it at a scale that degrades it for others.</p>

      <h2>Using the content</h2>
      <p>
        You may cite and share figures, maps and reports from the dashboard with attribution to the Smart Lab on Clean
        Rivers, IIT (BHU) Varanasi. Partner logos belong to their respective organisations. Map data © OpenStreetMap
        contributors; other datasets remain subject to the terms of their original sources.
      </p>

      <h2>No warranty</h2>
      <p>The dashboard is provided as is, without guarantees of accuracy, completeness or availability.</p>

      <h2>Changes</h2>
      <p>These terms may be updated as the project develops; the date above shows the latest version.</p>
    </LegalPage>
  );
}
