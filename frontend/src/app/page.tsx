"use client";

import { LayoutDashboard } from "lucide-react";
import { DonutChart, SimpleBarChart } from "@/components/charts";
import { Card, Grid, MetricCard, PageTitle } from "@/components/ui";
import { useSummary } from "@/lib/api";
import { SCALES, scaleColors } from "@/lib/colors";
import { fmt } from "@/lib/format";

export default function OverviewPage() {
  const { data: s } = useSummary();
  if (!s) return <div className="loading">Loading district summary…</div>;

  return (
    <>
      <PageTitle><LayoutDashboard size={24} /> Varanasi District Environmental &amp; Carbon Overview</PageTitle>
      <Grid cols={5}>
        <MetricCard label="Total Villages" value={fmt(s.total_villages)} sub="Cadastral Polygons" />
        <MetricCard label="Total Population" value={fmt(s.total_population)} sub="Census / Surveyed" />
        <MetricCard label="Geographical Area" value={`${fmt(s.total_area_ha, 1)} ha`} sub="Varanasi District" />
        <MetricCard label="Total GHG Emissions" value={`${fmt(s.total_co2e_t_yr)} t`} sub="t CO2e / yr (IPCC)" color="#d32f2f" />
        <MetricCard label="Mean Per Capita GHG" value={`${fmt(s.mean_per_capita_co2e_kg_yr, 1)} kg`} sub="kg CO2e / resident / yr" color="#f57c00" />
      </Grid>
      <div className="split">
        <Card title="🏛️ Block-Wise Carbon Emissions (t CO2e/year)">
          <SimpleBarChart
            data={s.block_emissions}
            category="block_name"
            series={[{ key: "total_co2e_t_yr", name: "t CO2e/yr" }]}
            rowColors={scaleColors(s.block_emissions.map((b) => b.total_co2e_t_yr), SCALES.greens)}
            decimals={0}
            angledTicks
            height={380}
          />
        </Card>
        <Card title="🍩 District Sectoral GHG Breakdown">
          <DonutChart data={s.sector_emissions.map((e) => ({ name: e.sector, value: e.co2e_t_yr }))} height={380} decimals={0} />
        </Card>
      </div>
    </>
  );
}
