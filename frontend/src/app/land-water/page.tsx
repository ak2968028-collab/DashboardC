"use client";

import { DonutChart, SimpleBarChart } from "@/components/charts";
import { Badge, Card, Grid, PageTitle, Stat, WithVillage } from "@/components/ui";
import { fmt, num } from "@/lib/format";

export default function LandWaterPage() {
  return (
    <WithVillage>
      {(v) => {
        const land = [
          { name: "Agricultural", value: num(v.agri_area_ha) },
          { name: "Built-up", value: num(v.builtup_area_ha) },
          { name: "Forest", value: num(v.forest_area_ha) },
          { name: "Barren", value: num(v.barren_area_ha) },
          { name: "Remaining/Other", value: num(v.remaining_area_ha) },
        ];
        const landColors = ["#4caf50", "#ff9800", "#2e7d32", "#8d6e63", "#90a4ae"];
        const shown = land.map((d, i) => ({ ...d, color: landColors[i] })).filter((d) => d.value > 0);
        const water = [
          { type: "Ponds / Tanks", area: num(v.pond_area_ha) },
          { type: "Canals / Drainage", area: num(v.canal_area_ha) },
          { type: "Rivers / Streams", area: num(v.river_area_ha) },
          { type: "Tube-wells / Wells", area: num(v.well_irrig_area_ha) },
        ];
        return (
          <>
            <PageTitle>🌾 Land Use &amp; Water Resources Inventory</PageTitle>
            <Badge kind="observed">OBSERVED CENSUS / GIS SURVEY DATA</Badge>
            <Grid cols={4}>
              <Stat label="Total Geographical Area" value={`${fmt(v.total_area_ha, 2)} ha`} />
              <Stat label="Agricultural Land Area" value={`${fmt(v.agri_area_ha, 2)} ha`} />
              <Stat label="Built-up / Settlement Area" value={`${fmt(v.builtup_area_ha, 2)} ha`} />
              <Stat label="Surface Water Bodies" value={`${fmt(v.total_water_area_ha, 2)} ha`} />
            </Grid>
            <Grid cols={2}>
              <Card title={`Land Use Distribution (${v.village_name})`}>
                <DonutChart data={shown} colors={shown.map((d) => d.color)} decimals={2} />
              </Card>
              <Card title="Water Resources Breakdown (Hectares)">
                <SimpleBarChart
                  data={water}
                  category="type"
                  series={[{ key: "area", name: "Area (ha)" }]}
                  rowColors={["#0288d1", "#0097a7", "#00acc1", "#26c6da"]}
                  decimals={2}
                />
              </Card>
            </Grid>
          </>
        );
      }}
    </WithVillage>
  );
}
