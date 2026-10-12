"use client";

import { DonutChart, SimpleBarChart } from "@/components/charts";
import { Badge, Card, Grid, MetricCard, PageTitle, WithVillage } from "@/components/ui";
import { SCALES, scaleColors } from "@/lib/colors";
import { fmt, num } from "@/lib/format";

export default function CarbonPage() {
  return (
    <WithVillage>
      {(v) => {
        const total = num(v.total_co2e_t_yr);
        const energy = num(v.energy_total_co2e_t_yr);
        const sectors = [
          { sector: "LPG Combustion", value: num(v.lpg_co2e_t_yr) },
          { sector: "Firewood Biomass Burning", value: num(v.firewood_co2e_t_yr) },
          { sector: "Grid Electricity Consumption", value: num(v.electricity_co2e_t_yr) },
          { sector: "Motorbike Petrol Transport", value: num(v.transport_co2e_t_yr) },
          { sector: "Solid Waste Disposal", value: num(v.waste_co2e_t_yr) },
          { sector: "Livestock Enteric Fermentation", value: num(v.livestock_co2e_t_yr) },
        ];
        return (
          <>
            <PageTitle>🌿 Village Greenhouse Gas Accounting &amp; Emission Modeling</PageTitle>
            <Badge kind="derived">DERIVED / CALCULATED SCIENTIFIC OUTPUT</Badge>
            <Grid cols={4}>
              <MetricCard label="Total Village Carbon Footprint" color="#d32f2f" value={`${fmt(total, 2)} t`} sub="Tonnes CO2e / year" />
              <MetricCard label="Per Capita Footprint" color="#f57c00" value={`${fmt(v.per_capita_co2e_kg_yr, 1)} kg`} sub="kg CO2e / person / year" />
              <MetricCard label="Energy Sector Emissions" color="#1976d2" value={`${fmt(energy, 2)} t`} sub="LPG + Wood + Electricity" />
              <MetricCard label="AFOLU & Waste Emissions" color="#388e3c" value={`${fmt(total - energy, 2)} t`} sub="Livestock + Waste + Transport" />
            </Grid>
            <div className="split">
              <Card title="📊 Sectoral GHG Emissions Breakdown">
                <SimpleBarChart
                  data={sectors}
                  category="sector"
                  series={[{ key: "value", name: "t CO2e/yr" }]}
                  rowColors={scaleColors(sectors.map((s) => s.value), SCALES.reds)}
                  horizontal
                  decimals={2}
                  valueLabel="Emissions (t CO2e/year)"
                />
              </Card>
              <Card title="🍩 Sectoral Contribution">
                <DonutChart data={sectors.map((s) => ({ name: s.sector, value: s.value }))} decimals={2} />
              </Card>
            </div>
            <hr />
            <Card title="📚 Modeling Methodology & IPCC Tier-1 Accounting Formula">
              <div className="formula">
                Total GHG Emission (t CO<sub>2</sub>e/year) = Σ<sub>i</sub> ( Annual Activity Data<sub>i</sub> × Emission Factor<sub>i</sub> ) / 1000
              </div>
              <ul>
                <li><b>LPG</b>: 2.984 kg CO<sub>2</sub>e/kg (IPCC 2006 Stationary Combustion).</li>
                <li><b>Firewood</b>: 1.747 kg CO<sub>2</sub>e/kg (MoEFCC &amp; IPCC Biomass default).</li>
                <li><b>Grid Electricity</b>: 0.820 kg CO<sub>2</sub>/kWh (Central Electricity Authority CEA India v20.0).</li>
                <li><b>Transport (Petrol)</b>: 2.310 kg CO<sub>2</sub>e/litre (IPCC 2006 Mobile Road Transport).</li>
                <li><b>Solid Waste</b>: 0.450 kg CO<sub>2</sub>e/kg (IPCC First Order Decay simplified rural factor).</li>
                <li><b>Livestock</b>: Dairy Cattle 980 kg CO<sub>2</sub>e/head/yr, Goats/Sheep 145.6 kg CO<sub>2</sub>e/head/yr (IPCC Indian Ruminant factors).</li>
              </ul>
            </Card>
          </>
        );
      }}
    </WithVillage>
  );
}
