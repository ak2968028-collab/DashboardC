import Image from "next/image";
import forest from "../../public/1920x688_header.jpg";

// Greenhouse gases covered by the emission factors (media/config/emission_factors.csv), GWP-100 from IPCC AR5.
const GASES = [
  { formula: <>CO<sub>2</sub></>, name: "Carbon Dioxide", gwp: 1, sources: "Electricity, LPG, firewood, petrol", tone: "co2" },
  { formula: <>CH<sub>4</sub></>, name: "Methane", gwp: 28, sources: "Livestock enteric, solid waste", tone: "ch4" },
  { formula: <>N<sub>2</sub>O</>, name: "Nitrous Oxide", gwp: 265, sources: "Fuel & biomass combustion", tone: "n2o" },
];

export default function CarbonHero() {
  return (
    <section className="carbon-hero">
      <Image src={forest} alt="" fill sizes="100vw" className="carbon-hero-bg" placeholder="blur" priority />
      <div className="carbon-hero-body">
        <div className="carbon-hero-text">
          <span className="eyebrow">IPCC Tier-1 · GHG Inventory</span>
          <h2>Village carbon footprint, in <span className="nowrap">CO<sub>2</sub>-equivalent</span></h2>
          <p>Every activity is converted to CO<sub>2</sub>e using its gas&apos;s Global Warming Potential.</p>
        </div>
        <div className="gas-cards">
          {GASES.map((g) => (
            <div key={g.tone} className={`gas-card ${g.tone}`}>
              <span className="gas-formula">{g.formula}</span>
              <span className="gas-name">{g.name}</span>
              <span className="gas-gwp">GWP {g.gwp}</span>
              <span className="gas-sources">{g.sources}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
