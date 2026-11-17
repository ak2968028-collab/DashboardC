"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchCensusVillage, useCensusVillages, useDistrictCensusVillages, useDistricts, useStates, useSubdistricts, useVillage,
  useVillages,
} from "@/lib/api";
import type { District, State, Subdistrict, Village, VillageDetails } from "@/lib/types";

/** "All blocks" option of the home page's own block filter. */
export const ALL_BLOCKS = "All Blocks";

// Census 2011 codes the dashboard opens on: Uttar Pradesh > Varanasi > all sub-districts > Ausanpur.
const DEFAULT_STATE = 9;
const DEFAULT_DISTRICT = 187;
const DEFAULT_VILLAGE = "208818";
const STORAGE_KEY = "varanasi-dashboard-selection";

/** One village in the selected area: every census village, plus surveyed villages missing from the census list. */
export interface PlaceOption {
  village_code: string;
  village_name: string;
  population_2011: number | null;
  /** Survey data for the village, when it is on the dashboard. */
  survey?: Village;
}

interface DashboardState {
  allVillages: Village[];
  /** Surveyed villages in the selected district / sub-district. */
  filteredVillages: Village[];

  states: State[];
  districts: District[];
  subdistricts: Subdistrict[];
  stateCode: number | null;
  districtCode: number | null;
  /** null = all sub-districts of the district. */
  subdistrictCode: number | null;
  setStateCode: (code: number | null) => void;
  setDistrictCode: (code: number | null) => void;
  setSubdistrictCode: (code: number | null) => void;
  /** "Sadar, Varanasi" style name of the selected area. */
  areaLabel: string;

  /** Villages offered by the village dropdown (empty until a district is chosen). */
  placeOptions: PlaceOption[];
  placesLoading: boolean;
  selectedCode: string | null;
  setSelectedCode: (code: string) => void;
  /** Selects a village and moves the State / District / Sub-district dropdowns to it. */
  selectVillage: (code: string) => void;
  /** The selected village, surveyed or not. */
  selectedPlace: PlaceOption | undefined;
  /** Survey details of the selected village (undefined while loading or when it has no survey data). */
  activeVillage: VillageDetails | undefined;

  /** Census codes are hidden on the dashboard until the viewer chooses to show them. */
  showCodes: boolean;
  setShowCodes: (show: boolean) => void;
  loading: boolean;
  error: Error | undefined;
}

const DashboardContext = createContext<DashboardState | null>(null);

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { data: rawVillages = [], isLoading, error } = useVillages();
  const allVillages = useMemo(
    () => [...rawVillages].sort((a, b) => a.village_name.localeCompare(b.village_name)),
    [rawVillages]
  );

  const [stateCode, setState] = useState<number | null>(DEFAULT_STATE);
  const [districtCode, setDistrict] = useState<number | null>(DEFAULT_DISTRICT);
  const [subdistrictCode, setSubdistrict] = useState<number | null>(null);
  const [selectedCode, setSelectedCode] = useState<string>(DEFAULT_VILLAGE);
  const [showCodes, setShowCodes] = useState(false);
  const [restored, setRestored] = useState(false);

  // Restore the last selection and viewing preferences for this browser.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && "state" in saved) {
        setState(saved.state ?? null);
        setDistrict(saved.district ?? null);
        setSubdistrict(saved.subdistrict ?? null);
      }
      if (saved?.village) setSelectedCode(saved.village);
      if (typeof saved?.showCodes === "boolean") setShowCodes(saved.showCodes);
    } catch {}
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        state: stateCode, district: districtCode, subdistrict: subdistrictCode, village: selectedCode, showCodes,
      }));
    } catch {}
  }, [restored, stateCode, districtCode, subdistrictCode, selectedCode, showCodes]);

  const { data: states = [] } = useStates();
  const { data: districts = [] } = useDistricts(stateCode);
  const { data: subdistricts = [] } = useSubdistricts(districtCode);
  const subVillages = useCensusVillages(subdistrictCode);
  const districtVillages = useDistrictCensusVillages(subdistrictCode ? null : districtCode);
  const census = subdistrictCode ? subVillages : districtVillages;

  const districtName = districts.find((d) => d.district_code === districtCode)?.district_name;
  const subdistrictName = subdistricts.find((s) => s.subdistrict_code === subdistrictCode)?.subdistrict_name;
  const areaLabel = subdistrictCode
    ? [subdistrictName, districtName].filter(Boolean).join(", ")
    : districtName ?? states.find((s) => s.state_code === stateCode)?.state_name ?? "";

  // Surveyed villages in the area: by census code, or by name for the few towns outside the census village list.
  const censusCodes = useMemo(() => new Set((census.data ?? []).map((c) => c.village_code)), [census.data]);
  const filteredVillages = useMemo(() => {
    if (!districtCode) return [];
    return allVillages.filter((v) => censusCodes.has(v.village_code)
      || (same(v.district, districtName) && (!subdistrictCode || same(v.subdistrict, subdistrictName))));
  }, [allVillages, censusCodes, districtCode, districtName, subdistrictCode, subdistrictName]);

  const placeOptions = useMemo<PlaceOption[]>(() => {
    if (!districtCode) return [];
    const byCode = new Map(allVillages.map((v) => [v.village_code, v]));
    const options: PlaceOption[] = (census.data ?? []).map((c) => ({
      village_code: c.village_code, village_name: c.village_name, population_2011: c.population_2011,
      survey: byCode.get(c.village_code),
    }));
    for (const v of filteredVillages) {
      if (!censusCodes.has(v.village_code)) {
        options.push({ village_code: v.village_code, village_name: v.village_name, population_2011: null, survey: v });
      }
    }
    return options.sort((a, b) => a.village_name.localeCompare(b.village_name));
  }, [allVillages, census.data, censusCodes, districtCode, filteredVillages]);

  // Keep the selected village inside the chosen area (preferring one with survey data) once its list has loaded.
  const effectiveCode = useMemo(() => {
    if (!placeOptions.length || census.isLoading) return selectedCode;
    if (placeOptions.some((p) => p.village_code === selectedCode)) return selectedCode;
    return (placeOptions.find((p) => p.survey) ?? placeOptions[0]).village_code;
  }, [placeOptions, census.isLoading, selectedCode]);

  const selectedPlace = useMemo<PlaceOption | undefined>(() => {
    const option = placeOptions.find((p) => p.village_code === effectiveCode);
    if (option) return option;
    const v = allVillages.find((x) => x.village_code === effectiveCode);
    return v && { village_code: v.village_code, village_name: v.village_name, population_2011: null, survey: v };
  }, [placeOptions, allVillages, effectiveCode]);

  const surveyed = allVillages.some((v) => v.village_code === effectiveCode);
  const { data: activeVillage } = useVillage(surveyed ? effectiveCode : null);

  const setStateCode = (code: number | null) => { setState(code); setDistrict(null); setSubdistrict(null); };
  const setDistrictCode = (code: number | null) => { setDistrict(code); setSubdistrict(null); };

  const selectVillage = useCallback((code: string) => {
    setSelectedCode(code);
    fetchCensusVillage(code)
      .then((c) => { setState(c.state_code); setDistrict(c.district_code); setSubdistrict(c.subdistrict_code); })
      // Not in the census list (a town): show its whole district instead.
      .catch(() => setSubdistrict(null));
  }, []);

  return (
    <DashboardContext.Provider
      value={{
        allVillages,
        filteredVillages,
        states,
        districts,
        subdistricts,
        stateCode,
        districtCode,
        subdistrictCode,
        setStateCode,
        setDistrictCode,
        setSubdistrictCode: setSubdistrict,
        areaLabel,
        placeOptions,
        placesLoading: census.isLoading,
        selectedCode: effectiveCode,
        setSelectedCode,
        selectVillage,
        selectedPlace,
        activeVillage,
        showCodes,
        setShowCodes,
        loading: isLoading,
        error,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used inside DashboardProvider");
  return ctx;
}

/** "Name · Block", with the census code only when codes are shown. */
export const villageLabel = (v: Village, showCode = false) =>
  `${v.village_name} · ${v.block_name}${showCode ? ` · ${v.village_code}` : ""}`;
