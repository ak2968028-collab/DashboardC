import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { ExternalLink, Leaf } from "lucide-react";
import cpcb from "../../public/footer/50.png";
import iitMadras from "../../public/footer/IIT_Madras_Logo.svg.png";
import nih from "../../public/footer/download.png";
import iitDelhi from "../../public/footer/iit_delhi_logo.png";
import iitBhu from "../../public/footer/iitbhu.png";
import iitBombay from "../../public/footer/iitbombay.png";
import hokkaido from "../../public/footer/japan.webp";
import denmark from "../../public/footer/logo1.png";
import jalShakti from "../../public/footer/logo2.svg";
import namamiGange from "../../public/footer/logo3.gif";

interface Partner { name: string; logo: StaticImageData; href: string; wide?: boolean }

// Partner logos in public/footer; each links to the organisation's official site.
const PARTNERS: Partner[] = [
  { name: "IIT (BHU) Varanasi", logo: iitBhu, href: "https://iitbhu.ac.in" },
  { name: "Ministry of Jal Shakti", logo: jalShakti, href: "https://jalshakti-dowr.gov.in", wide: true },
  { name: "Namami Gange (NMCG)", logo: namamiGange, href: "https://nmcg.nic.in", wide: true },
  { name: "Central Pollution Control Board", logo: cpcb, href: "https://cpcb.nic.in" },
  { name: "National Institute of Hydrology", logo: nih, href: "https://nihroorkee.gov.in" },
  { name: "IIT Delhi", logo: iitDelhi, href: "https://home.iitd.ac.in" },
  { name: "IIT Bombay", logo: iitBombay, href: "https://www.iitb.ac.in" },
  { name: "IIT Madras", logo: iitMadras, href: "https://www.iitm.ac.in" },
  { name: "Hokkaido University", logo: hokkaido, href: "https://www.global.hokudai.ac.jp", wide: true },
  { name: "Ministry of Foreign Affairs of Denmark", logo: denmark, href: "https://um.dk/en", wide: true },
];

const EXPLORE = [
  { href: "/", label: "Overview" },
  { href: "/map", label: "Village Map" },
  { href: "/carbon", label: "Carbon Emission" },
  { href: "/visualize", label: "Carbon Lab 3D" },
  { href: "/ranking", label: "Village Ranking" },
  { href: "/reports", label: "Village Reports" },
];

const RESOURCES = [
  { href: "/settings", label: "Methodology & emission factors" },
  { href: "https://www.ipcc-nggip.iges.or.jp/public/2006gl/", label: "IPCC 2006 Guidelines", external: true },
  { href: "https://cea.nic.in/cdm-co2-baseline-database/?lang=en", label: "CEA CO₂ Baseline Database", external: true },
  { href: "https://www.openstreetmap.org/copyright", label: "OpenStreetMap", external: true },
];

const LEGAL = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Use" },
  { href: "/disclaimer", label: "Data & Disclaimer" },
];

const FooterLink = ({ href, label, external }: { href: string; label: string; external?: boolean }) =>
  external ? (
    <a href={href} target="_blank" rel="noopener noreferrer">{label} <ExternalLink size={11} aria-hidden /></a>
  ) : (
    <Link href={href}>{label}</Link>
  );

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <section className="footer-partners" aria-label="Partners">
        <h2>In collaboration with</h2>
        <ul>
          {PARTNERS.map((p) => (
            <li key={p.name} className={p.wide ? "wide" : ""}>
              <a href={p.href} target="_blank" rel="noopener noreferrer" title={p.name}>
                <Image src={p.logo} alt={p.name} sizes="160px" unoptimized={p.logo.src.endsWith(".svg") || p.logo.src.endsWith(".gif")} />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="footer-main">
        <div className="footer-about">
          <span className="footer-brand"><span className="brand-badge"><Leaf size={16} /></span> Village Carbon Dashboard</span>
          <p>
            Village-level environmental resource assessment and carbon emission modelling for Varanasi district, built
            with IPCC Tier-1 methods on village survey data, cadastral maps and land-cover rasters.
          </p>
          <p className="footer-muted">Smart Lab on Clean Rivers · IIT (BHU) Varanasi · M.Tech research project</p>
        </div>
        <nav aria-label="Explore">
          <h3>Explore</h3>
          {EXPLORE.map((l) => <FooterLink key={l.href} {...l} />)}
        </nav>
        <nav aria-label="Resources">
          <h3>Resources</h3>
          {RESOURCES.map((l) => <FooterLink key={l.href} {...l} />)}
        </nav>
      </section>

      <div className="footer-bar">
        <span>© {new Date().getFullYear()} Smart Lab on Clean Rivers, IIT (BHU) Varanasi · Dashboard v2.0</span>
        <nav aria-label="Legal">
          {LEGAL.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
        </nav>
      </div>
    </footer>
  );
}
