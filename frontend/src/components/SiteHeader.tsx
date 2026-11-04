import Image from "next/image";
import Link from "next/link";
import seal from "../../public/logo_iitbhu.png";
import iitLogo from "../../public/left2_IIt_logo.png";
import slcrLogo from "../../public/right1_slcr.png";

/** Compact institutional header: institute logos either side of the centred dashboard title, in the page-width column. */
export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-bar">
        <Link href="/" className="site-header-logos" aria-label="Home">
          <Image src={seal} alt="IIT (BHU) Varanasi seal" className="seal" priority />
          <Image src={iitLogo} alt="Indian Institute of Technology (Banaras Hindu University)" className="iit-logo" priority />
        </Link>
        <div className="site-header-title">
          <span className="site-eyebrow">Varanasi District · Uttar Pradesh</span>
          <h1>Village Environment &amp; Carbon Dashboard</h1>
          <span className="site-underline" aria-hidden />
        </div>
        <Image src={slcrLogo} alt="Smart Lab on Clean Rivers" className="slcr-logo" priority />
      </div>
    </header>
  );
}
