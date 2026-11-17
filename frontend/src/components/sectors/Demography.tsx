import { DonutChart, SimpleBarChart } from "@/components/charts";
import { useDashboard } from "@/components/DashboardContext";
import { Badge, Card, Grid, PageTitle, Stat, WithVillage } from "@/components/ui";
import { fmt, mean, num } from "@/lib/format";

export default function DemographyPage() {
  const { allVillages } = useDashboard();
  return (
    <WithVillage>
      {(v) => {
        // Benchmark: mean of the surveyed villages in the same sub-district.
        const area = v.subdistrict ?? v.district;
        const peers = allVillages.filter((x) => (x.subdistrict ?? x.district) === area);
        const benchmark = `${area} Mean`;
        const comparison = [
          { category: "Residents", village: num(v.total_residents), block: Math.round(mean(peers.map((x) => x.total_residents))) },
          { category: "Households", village: num(v.total_households), block: Math.round(mean(peers.map((x) => x.total_households))) },
        ];
        return (
          <>
            <PageTitle>👥 Demographic Profile</PageTitle>
            <Badge kind="observed">OBSERVED CENSUS / FIELD SURVEY DATA</Badge>
            <Grid cols={4}>
              <Stat label="Total Residents" value={fmt(v.total_residents)} />
              <Stat label="Total Households" value={fmt(v.total_households)} />
              <Stat label="Male Residents" value={fmt(v.total_male)} />
              <Stat label="Female Residents" value={fmt(v.total_female)} />
            </Grid>
            <Grid cols={2}>
              <Card title="Gender Composition">
                <DonutChart
                  data={[{ name: "Male Residents", value: num(v.total_male) }, { name: "Female Residents", value: num(v.total_female) }]}
                  colors={["#1976d2", "#e91e63"]}
                  height={320}
                  decimals={0}
                />
              </Card>
              <Card title={`Comparison with ${area} Sub-district Benchmark`}>
                <SimpleBarChart
                  data={comparison}
                  category="category"
                  series={[{ key: "village", name: "This Village", color: "#2e7d32" }, { key: "block", name: benchmark, color: "#90a4ae" }]}
                  decimals={0}
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
