"use client";

import { SimpleBarChart } from "@/components/charts";
import { Badge, Card, Grid, PageTitle, Stat, WithVillage } from "@/components/ui";
import { fmt, num } from "@/lib/format";

export default function LivestockPage() {
  return (
    <WithVillage>
      {(v) => (
        <>
          <PageTitle>🐄 Livestock Population &amp; Ruminant Census</PageTitle>
          <Badge kind="observed">OBSERVED LIVESTOCK SURVEY DATA</Badge>
          <Grid cols={4}>
            <Stat label="Dairy Cattle / Cows" value={`${fmt(v.cows_count)} heads`} />
            <Stat label="Goats (Caprine)" value={`${fmt(v.goats_count)} heads`} />
            <Stat label="Sheep (Ovine)" value={`${fmt(v.sheep_count)} heads`} />
            <Stat label="Total Livestock" value={`${fmt(v.total_livestock)} heads`} />
          </Grid>
          <Card title={`Livestock Herd Composition (${v.village_name})`}>
            <SimpleBarChart
              data={[
                { species: "Dairy Cattle / Cows", count: num(v.cows_count) },
                { species: "Goats", count: num(v.goats_count) },
                { species: "Sheep", count: num(v.sheep_count) },
              ]}
              category="species"
              series={[{ key: "count", name: "Count" }]}
              rowColors={["#4e342e", "#ffb300", "#8d6e63"]}
              decimals={0}
            />
          </Card>
        </>
      )}
    </WithVillage>
  );
}
