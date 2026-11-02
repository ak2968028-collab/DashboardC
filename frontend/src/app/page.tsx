"use client";

import { LayoutDashboard } from "lucide-react";
import { DonutChart, SimpleBarChart } from "@/components/charts";
import MiniVideo, { type VideoItem } from "@/components/MiniVideo";
import { Card, Grid, MetricCard, PageTitle } from "@/components/ui";
import { useSummary } from "@/lib/api";
import { SCALES, scaleColors } from "@/lib/colors";
import { fmt } from "@/lib/format";

// Files in public/vedio/.
const VIDEOS: VideoItem[] = [
  {
    src: "/vedio/gemini_generated_video_86ec48a4.mp4",
    poster: "/vedio/smoke_to_solar_poster.webp",
    title: "From smoke to a green future",
    source: "AI-generated with Google Gemini",
    durationSec: 10,
    loop: true,
    caption: "Smoke and parched land give way to solar farms and green, low-carbon settlements — the change this dashboard helps villages measure and plan.",
  },
  {
    src: "/vedio/vidssave.com Watch One Year Of Carbon Emissions Take Over The Planet 1080P.mp4",
    poster: "/vedio/carbon_year_poster.webp",
    title: "One year of carbon emissions",
    source: "TIME · footage NASA & Getty Images",
    durationSec: 152,
    hasAudio: true,
    caption: "NASA visualisations of a year of carbon dioxide moving through Earth's atmosphere — emissions from every source, villages included, mix into one shared atmosphere.",
  },
];

export default function OverviewPage() {
  const { data: s } = useSummary();
  if (!s) return <div className="loading">Loading district summary…</div>;
  const topSector = [...s.sector_emissions].sort((a, b) => b.co2e_t_yr - a.co2e_t_yr)[0];
  const topBlock = [...s.block_emissions].sort((a, b) => b.total_co2e_t_yr - a.total_co2e_t_yr)[0];

  return (
    <>
      <PageTitle><LayoutDashboard size={24} /> Varanasi District Environmental &amp; Carbon Overview</PageTitle>
      <div className="overview-layout">
        <div className="overview-main">
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
        </div>
        <aside className="overview-side">
          <MiniVideo videos={VIDEOS}>
            <ul className="mini-facts">
              {topSector && (
                <li>
                  <span>Largest district source</span>
                  <b>{topSector.sector}</b>
                  <small>{fmt((topSector.co2e_t_yr / s.total_co2e_t_yr) * 100, 1)}% of {fmt(s.total_co2e_t_yr)} t CO₂e/yr</small>
                </li>
              )}
              {topBlock && (
                <li>
                  <span>Highest-emitting block</span>
                  <b>{topBlock.block_name}</b>
                  <small>{fmt(topBlock.total_co2e_t_yr)} t CO₂e/yr</small>
                </li>
              )}
            </ul>
          </MiniVideo>
        </aside>
      </div>
    </>
  );
}
