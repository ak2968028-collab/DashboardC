"use client";

import { SimpleBarChart } from "@/components/charts";
import { useDashboard } from "@/components/DashboardContext";
import { Badge, Card, Grid, MetricCard, PageTitle, WithVillage } from "@/components/ui";
import { fmt, mean, num } from "@/lib/format";

export default function EnergyPage() {
  const { allVillages } = useDashboard();
  return (
    <WithVillage>
      {(v) => {
        const blockAvg = mean(allVillages.filter((x) => x.block_name === v.block_name).map((x) => x.electricity_monthly_kwh));
        return (
          <>
            <PageTitle>⚡ Household &amp; Agricultural Energy Consumption</PageTitle>
            <Badge kind="observed">OBSERVED ACTIVITY SURVEY DATA</Badge>
            <Grid cols={3}>
              <MetricCard label="LPG Consumption" color="#f57c00" value={`${fmt(v.lpg_monthly_kg, 1)} kg`}
                sub={`Monthly Volume (${fmt(num(v.lpg_monthly_kg) * 12, 1)} kg/yr)`} />
              <MetricCard label="Firewood / Biomass Burned" color="#8d6e63" value={`${fmt(v.firewood_monthly_kg, 1)} kg`}
                sub={`Monthly Volume (${fmt(num(v.firewood_monthly_kg) * 12, 1)} kg/yr)`} />
              <MetricCard label="Electricity Consumption" color="#0288d1" value={`${fmt(v.electricity_monthly_kwh, 1)} kWh`}
                sub={`Monthly Grid Usage (${fmt(num(v.electricity_monthly_kwh) * 12, 1)} kWh/yr)`} />
            </Grid>
            <Grid cols={2}>
              <Card title="Biomass vs LPG Solid/Gas Fuel Volumes (kg/month)">
                <SimpleBarChart
                  data={[
                    { fuel: "LPG (kg/month)", value: num(v.lpg_monthly_kg) },
                    { fuel: "Firewood (kg/month)", value: num(v.firewood_monthly_kg) },
                  ]}
                  category="fuel"
                  series={[{ key: "value", name: "Consumption" }]}
                  rowColors={["#f57c00", "#8d6e63"]}
                  height={320}
                />
              </Card>
              <Card title="Electricity Demand vs Block Benchmark (kWh/month)">
                <SimpleBarChart
                  data={[
                    { scope: v.village_name, value: num(v.electricity_monthly_kwh) },
                    { scope: `${v.block_name} Mean`, value: Math.round(blockAvg * 10) / 10 },
                  ]}
                  category="scope"
                  series={[{ key: "value", name: "kWh/month" }]}
                  rowColors={["#0288d1", "#78909c"]}
                  height={320}
                />
              </Card>
            </Grid>
          </>
        );
      }}
    </WithVillage>
  );
}
