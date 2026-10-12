"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { QUALITATIVE, SimpleBarChart } from "@/components/charts";
import { useDashboard, villageLabel } from "@/components/DashboardContext";
import { Alert, Card, DataTable, PageTitle, type Column } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { Village } from "@/lib/types";

const MAX_VILLAGES = 5;

const MATRIX: { label: string; key: keyof Village; decimals?: number }[] = [
  { label: "Village Name", key: "village_name" },
  { label: "Block", key: "block_name" },
  { label: "Residents", key: "total_residents", decimals: 0 },
  { label: "Households", key: "total_households", decimals: 0 },
  { label: "Total Area (ha)", key: "total_area_ha", decimals: 2 },
  { label: "Built-up (ha)", key: "builtup_area_ha", decimals: 2 },
  { label: "Agricultural (ha)", key: "agri_area_ha", decimals: 2 },
  { label: "Water Bodies (ha)", key: "total_water_area_ha", decimals: 2 },
  { label: "LPG (kg/mo)", key: "lpg_monthly_kg", decimals: 1 },
  { label: "Firewood (kg/mo)", key: "firewood_monthly_kg", decimals: 1 },
  { label: "Electricity (kWh/mo)", key: "electricity_monthly_kwh", decimals: 1 },
  { label: "Solid Waste (kg/mo)", key: "waste_monthly_kg", decimals: 1 },
  { label: "Motorbikes", key: "motorbikes_count", decimals: 0 },
  { label: "Petrol (L/mo)", key: "petrol_monthly_litres", decimals: 1 },
  { label: "Total Livestock", key: "total_livestock", decimals: 0 },
  { label: "Total Carbon (t CO2e/yr)", key: "total_co2e_t_yr", decimals: 2 },
  { label: "Per Capita (kg CO2e/yr)", key: "per_capita_co2e_kg_yr", decimals: 2 },
];

export default function ComparisonPage() {
  const { allVillages, filteredVillages, selectedCode } = useDashboard();
  const [codes, setCodes] = useState<string[]>([]);

  // Default: the active village plus the next village in the list.
  useEffect(() => {
    if (codes.length || !selectedCode) return;
    const other = filteredVillages.find((v) => v.village_code !== selectedCode);
    setCodes(other ? [selectedCode, other.village_code] : [selectedCode]);
  }, [selectedCode, filteredVillages, codes.length]);

  const byCode = useMemo(() => new Map(allVillages.map((v) => [v.village_code, v])), [allVillages]);
  const chosen = codes.map((c) => byCode.get(c)).filter((v): v is Village => !!v);
  const available = filteredVillages.filter((v) => !codes.includes(v.village_code));

  const columns: Column<Village>[] = MATRIX.map((m) => ({
    key: m.key,
    label: m.label,
    numeric: m.decimals !== undefined,
    render: (v) => (m.decimals !== undefined ? fmt(v[m.key] as number | null, m.decimals) : String(v[m.key] ?? "")),
  }));

  return (
    <>
      <PageTitle>⚖️ Multi-Village Comparative Analysis</PageTitle>
      <p>Select 2 to 5 villages to evaluate side-by-side across all 12 parameters and total greenhouse gas emissions.</p>
      <label className="field grow">
        <span>Choose Villages for Comparison (2 to 5):</span>
        <select
          value=""
          disabled={codes.length >= MAX_VILLAGES}
          onChange={(e) => e.target.value && setCodes([...codes, e.target.value])}
        >
          <option value="">{codes.length >= MAX_VILLAGES ? "Maximum of 5 villages selected" : "+ Add a village…"}</option>
          {available.map((v) => <option key={v.village_code} value={v.village_code}>{villageLabel(v)}</option>)}
        </select>
      </label>
      <div className="chip-row">
        {chosen.map((v) => (
          <span key={v.village_code} className="chip">
            {villageLabel(v)}
            <button onClick={() => setCodes(codes.filter((c) => c !== v.village_code))} aria-label={`Remove ${v.village_name}`}><X size={14} /></button>
          </span>
        ))}
      </div>

      {chosen.length >= 2 ? (
        <>
          <Card title="Comparison: Total Carbon Footprint (t CO2e/year)">
            <SimpleBarChart
              data={chosen.map((v) => ({ village: v.village_name, total: v.total_co2e_t_yr }))}
              category="village"
              series={[{ key: "total", name: "Total Emissions (t CO2e/yr)" }]}
              rowColors={QUALITATIVE}
              valueLabel="Total Emissions (t CO2e/yr)"
            />
          </Card>
          <h5 className="card-title" style={{ marginTop: 18 }}>📋 Comparative Data Matrix</h5>
          <DataTable rows={chosen} columns={columns} rowKey={(v) => v.village_code} />
        </>
      ) : (
        <Alert kind="warning">Please select at least 2 villages to view the comparative matrix.</Alert>
      )}
    </>
  );
}
