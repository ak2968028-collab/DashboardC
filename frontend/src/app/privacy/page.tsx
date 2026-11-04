import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy · Village Carbon Dashboard" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="4 November 2026">
      <p>
        The Village Environment &amp; Carbon Dashboard is a research tool of the Smart Lab on Clean Rivers, IIT (BHU)
        Varanasi. This page explains what information the dashboard handles and why.
      </p>

      <h2>Browsing without an account</h2>
      <p>You can use the public pages without signing in. The dashboard does not use advertising or analytics trackers.</p>
      <p>Your browser keeps a few settings in its local storage so the dashboard remembers them on your next visit:</p>
      <ul>
        <li>the block and village you last selected, and whether census codes are shown;</li>
        <li>whether the overview video player is collapsed.</li>
      </ul>
      <p>These stay on your device and can be removed by clearing site data in your browser.</p>

      <h2>Signing in</h2>
      <p>
        Accounts are created by the dashboard administrators for supervisors and administrators. For each account we keep
        the username, role and a securely hashed password. When you sign in, a login token is stored in your browser so you
        stay signed in; signing out removes it. Village data you submit is stored with your username so it can be reviewed
        and approved.
      </p>

      <h2>Server logs</h2>
      <p>
        Like most web services, the server records technical request logs (such as IP address, time and the page or data
        requested) to keep the service secure and working. They are used only for operating the dashboard.
      </p>

      <h2>Third-party services</h2>
      <p>Some content is loaded from other providers, who receive your IP address when your browser requests it:</p>
      <ul>
        <li>map tiles from OpenStreetMap and satellite imagery from Esri;</li>
        <li>the site may be delivered through Cloudflare&apos;s network.</li>
      </ul>
      <p>Their own privacy policies apply to those requests.</p>

      <h2>Village data</h2>
      <p>
        The dashboard shows village-level statistics (population, land use, energy, waste, livestock and estimated
        emissions). It does not publish information about individual households or people.
      </p>

      <h2>Questions</h2>
      <p>For questions about this policy or your account, contact the Smart Lab on Clean Rivers team at IIT (BHU) Varanasi.</p>
    </LegalPage>
  );
}
