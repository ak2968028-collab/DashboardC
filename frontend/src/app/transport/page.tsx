"use client";

import { Alert, Badge, Grid, PageTitle, Stat, WithVillage } from "@/components/ui";
import { fmt, num } from "@/lib/format";

export default function TransportPage() {
  return (
    <WithVillage>
      {(v) => {
        const households = num(v.total_households);
        const ratio = households > 0 ? num(v.motorbikes_count) / households : 0;
        return (
          <>
            <PageTitle>🛵 Rural Transportation &amp; Fuel Consumption</PageTitle>
            <Badge kind="observed">OBSERVED ACTIVITY SURVEY DATA</Badge>
            <Grid cols={3}>
              <Stat label="2-Wheeler Motorbikes" value={`${fmt(v.motorbikes_count)} vehicles`} />
              <Stat label="Monthly Petrol Consumption" value={`${fmt(v.petrol_monthly_litres, 1)} Litres`} />
              <Stat label="Annual Fuel Volume" value={`${fmt(num(v.petrol_monthly_litres) * 12, 1)} Litres/yr`} />
            </Grid>
            <Alert kind="info">
              📊 <b>Motorization Rate:</b> {ratio.toFixed(2)} registered motorbikes per household in {v.village_name}.
            </Alert>
          </>
        );
      }}
    </WithVillage>
  );
}
