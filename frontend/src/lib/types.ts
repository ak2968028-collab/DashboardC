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

// ---------- Census 2011 locations ----------

export interface State { state_code: number; state_name: string }
export interface District { district_code: number; district_name: string; state_code: number }
export interface Subdistrict { subdistrict_code: number; subdistrict_name: string; district_code: number }

export interface CensusVillage {
  village_code: string;
  village_name: string;
  subdistrict_code: number;
  population_2011: number | null;
  /** Village already has survey data in the dashboard. */
  on_dashboard: boolean;
}

export interface CensusVillageDetails extends CensusVillage {
  subdistrict_name: string;
  district_code: number;
  district_name: string;
  state_code: number;
  state_name: string;
}

// ---------- Logins & supervisor submissions ----------

export type Role = "admin" | "supervisor";
/** Supervisor: unverified = no village chosen; pending = certificate waiting for the admin. */
export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";

export interface User {
  id: number;
  username: string;
  full_name: string | null;
  role: Role;
  village_code: string | null;
  village_name: string | null;
  subdistrict_name: string | null;
  district_name: string | null;
  state_name: string | null;
  is_active: boolean;
  created_at: string;
  verification_status: VerificationStatus | null;
  verification_comment: string | null;
  verified_by: string | null;
  verified_at: string | null;
  certificate_filename: string | null;
  certificate_uploaded_at: string | null;
}

export interface SurveyField {
  key: string;
  label: string;
  unit: string;
  section: string;
  integer: boolean;
}

export type SurveyValues = Record<string, number | null>;
export type SubmissionStatus = "pending" | "approved" | "rejected";

export interface Submission {
  id: number;
  village_code: string;
  village_name: string | null;
  subdistrict_name: string | null;
  district_name: string | null;
  source: "form" | "excel";
  values: Record<string, number>;
  status: SubmissionStatus;
  review_comment: string | null;
  submitted_by: string | null;
  reviewed_by: string | null;
  created_at: string;
  modified_at: string;
  reviewed_at: string | null;
}

export interface SubmissionDetails extends Submission {
  /** Dashboard values now; null when the village is not on the dashboard yet. */
  current: SurveyValues | null;
  warnings: string[];
}

export interface SupervisorVillage {
  village: CensusVillageDetails | null;
  current: SurveyValues | null;
}
