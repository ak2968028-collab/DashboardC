import Image from "next/image";
import seal from "../../public/logo_iitbhu.png";
import iitLogo from "../../public/left2_IIt_logo.png";
import slcrLogo from "../../public/right1_slcr.png";
import co2Icon from "../../public/co2_icon.webp";

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-logos">
        <Image src={seal} alt="IIT (BHU) Varanasi seal" className="seal" priority />
        <Image src={iitLogo} alt="Indian Institute of Technology (Banaras Hindu University)" className="iit-logo" priority />
      </div>
      <div className="site-header-title">
        <span className="co2-icon"><Image src={co2Icon} alt="CO₂ emission reduction" priority /></span>
        <div>
          <h1>Village Environment &amp; Carbon Dashboard</h1>
          <p>Village-Level Environmental Resource Assessment and Carbon Emission Modeling · M.Tech Thesis Project</p>
        </div>
      </div>
      <Image src={slcrLogo} alt="Smart Lab on Clean Rivers" className="slcr-logo" priority />
    </header>
  );
}
