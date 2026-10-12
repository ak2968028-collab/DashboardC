// Shapes returned by the FastAPI backend (api/main.py).

export interface Village {
  village_id: number;
  village_code: string;
  village_name: string;
  block_name: string;
  subdistrict: string | null;
  latitude: number | null;
  longitude: number | null;
  total_residents: number | null;
  total_households: number | null;
  total_area_ha: number | null;
  builtup_area_ha: number | null;
  agri_area_ha: number | null;
  total_water_area_ha: number | null;
  lpg_monthly_kg: number | null;
  firewood_monthly_kg: number | null;
  electricity_monthly_kwh: number | null;
  waste_monthly_kg: number | null;
  motorbikes_count: number | null;
  petrol_monthly_litres: number | null;
  cows_count: number | null;
  goats_count: number | null;
  sheep_count: number | null;
  total_livestock: number | null;
  lpg_co2e_t_yr: number | null;
  firewood_co2e_t_yr: number | null;
  electricity_co2e_t_yr: number | null;
  energy_total_co2e_t_yr: number | null;
  transport_co2e_t_yr: number | null;
  waste_co2e_t_yr: number | null;
  livestock_co2e_t_yr: number | null;
  total_co2e_t_yr: number | null;
  per_capita_co2e_kg_yr: number | null;
}

export interface VillageDetails extends Village {
  district: string;
  state: string;
  total_male: number | null;
  total_female: number | null;
  forest_area_ha: number | null;
  barren_area_ha: number | null;
  culturable_waste_ha: number | null;
  fallow_land_ha: number | null;
  remaining_area_ha: number | null;
  pond_area_ha: number | null;
  river_area_ha: number | null;
  canal_area_ha: number | null;
  well_irrig_area_ha: number | null;
  other_water_ha: number | null;
}

export type NumericKey = {
  [K in keyof Village]: Village[K] extends number | null ? K : never;
}[keyof Village];

export interface Summary {
  total_villages: number;
  total_population: number;
  total_area_ha: number;
  total_co2e_t_yr: number;
  mean_per_capita_co2e_kg_yr: number;
  block_emissions: { block_name: string; total_co2e_t_yr: number }[];
  sector_emissions: { sector: string; co2e_t_yr: number }[];
}

export interface EmissionFactor {
  activity: string;
  unit: string;
  factor: number;
  factor_unit: string;
  standard: string;
}

export interface ImportReport {
  total_rows: number;
  inserted: number;
  updated: number;
  warnings: string[];
  villages_recalculated: number;
}

export interface RasterLayer {
  name: string;
  title: string;
  group: string;
  workspace: string;
  /** GeoServer WMS layer name (workspace:name) */
  layer: string;
}
