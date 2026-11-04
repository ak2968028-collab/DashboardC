import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Data & Disclaimer · Village Carbon Dashboard" };

export default function DisclaimerPage() {
  return (
    <LegalPage title="Data Sources & Disclaimer" updated="4 November 2026">
      <h2>How emissions are estimated</h2>
      <p>
        Village emissions follow the IPCC 2006 Tier-1 approach: surveyed activity data (LPG, firewood, electricity,
        petrol, solid waste and livestock) multiplied by standard emission factors, with grid electricity from the CEA CO₂
        baseline. Monthly survey values are scaled to a year. Factors are listed on the{" "}
        <Link href="/settings">Methodology</Link> page.
      </p>

      <h2>Data sources</h2>
      <ul>
        <li>Village survey and Excel imports, and data entered by supervisors after approval.</li>
        <li>Census village boundaries, and village boundaries dissolved from cadastral (khasra) parcel maps.</li>
        <li>A land-use / land-cover (LULC) raster, used to place emissions within villages.</li>
        <li>Base maps from OpenStreetMap and Esri.</li>
      </ul>

      <h2>Limitations</h2>
      <ul>
        <li>Survey figures are self-reported monthly averages; seasonal changes are not captured, and missing entries count as zero.</li>
        <li>Tier-1 factors are generic defaults, not measurements for Varanasi.</li>
        <li>Some sources are not yet surveyed (for example dung cakes, crop-residue burning, diesel pumps and fertiliser), so totals are likely underestimates.</li>
        <li>Emission maps show where emissions are attributed by land cover, not measured concentrations. Villages outside the LULC coverage are spread evenly.</li>
        <li>3D village views, house positions and Carbon Lab scenarios are illustrative.</li>
      </ul>

      <h2>Disclaimer</h2>
      <p>
        The dashboard is a research product. Its figures are estimates intended to support understanding and planning, not
        official statistics or regulatory reporting. Check important decisions against primary sources.
      </p>
    </LegalPage>
  );
}
