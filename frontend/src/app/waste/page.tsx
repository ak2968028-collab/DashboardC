"use client";

import { Badge, Grid, PageTitle, Stat, WithVillage } from "@/components/ui";
import { fmt, num } from "@/lib/format";

export default function WastePage() {
  return (
    <WithVillage>
      {(v) => {
        const monthly = num(v.waste_monthly_kg);
        const pop = num(v.total_residents);
        const perCapitaDaily = pop > 0 ? monthly / pop / 30 : 0;
        return (
          <>
            <PageTitle>🗑️ Solid Waste Generation</PageTitle>
            <Badge kind="observed">OBSERVED ACTIVITY SURVEY DATA</Badge>
            <Grid cols={3}>
              <Stat label="Monthly Waste Generated" value={`${fmt(monthly, 1)} kg/month`} />
              <Stat label="Annual Solid Waste" value={`${fmt((monthly * 12) / 1000, 2)} Tonnes/yr`} />
              <Stat label="Per Capita Rate" value={`${perCapitaDaily.toFixed(3)} kg/capita/day`} />
            </Grid>
          </>
        );
      }}
    </WithVillage>
  );
}
