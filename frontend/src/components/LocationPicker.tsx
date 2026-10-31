"use client";

import { useMemo, useState } from "react";
import { useCensusVillages, useDistricts, useStates, useSubdistricts } from "@/lib/api";
import type { CensusVillage } from "@/lib/types";

// Census 2011 codes the picker opens on: Uttar Pradesh > Varanasi.
const DEFAULT_STATE = 9;
const DEFAULT_DISTRICT = 187;

/** State > District > Sub-district > Village picker over the census location tables. */
export default function LocationPicker({ value, onChange, takenCodes = [] }: {
  value: CensusVillage | null;
  onChange: (village: CensusVillage | null) => void;
  /** Villages that already have a supervisor (shown, but not selectable). */
  takenCodes?: string[];
}) {
  const [state, setState] = useState<number | null>(DEFAULT_STATE);
  const [district, setDistrict] = useState<number | null>(DEFAULT_DISTRICT);
  const [subdistrict, setSubdistrict] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const { data: states = [] } = useStates();
  const { data: districts = [] } = useDistricts(state);
  const { data: subdistricts = [] } = useSubdistricts(district);
  const { data: villages = [], isLoading } = useCensusVillages(subdistrict);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? villages.filter((v) => v.village_name.toLowerCase().includes(q) || v.village_code.includes(q)) : villages;
  }, [villages, search]);

  const toNum = (s: string) => (s ? Number(s) : null);

  return (
    <div className="controls location-picker">
      <label className="field">
        <span>State</span>
        <select value={state ?? ""} onChange={(e) => { setState(toNum(e.target.value)); setDistrict(null); setSubdistrict(null); onChange(null); }}>
          <option value="">Select state…</option>
          {states.map((s) => <option key={s.state_code} value={s.state_code}>{s.state_name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>District</span>
        <select value={district ?? ""} disabled={!state} onChange={(e) => { setDistrict(toNum(e.target.value)); setSubdistrict(null); onChange(null); }}>
          <option value="">Select district…</option>
          {districts.map((d) => <option key={d.district_code} value={d.district_code}>{d.district_name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Sub-district (Tehsil)</span>
        <select value={subdistrict ?? ""} disabled={!district} onChange={(e) => { setSubdistrict(toNum(e.target.value)); onChange(null); }}>
          <option value="">Select sub-district…</option>
          {subdistricts.map((s) => <option key={s.subdistrict_code} value={s.subdistrict_code}>{s.subdistrict_name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Find village</span>
        <input type="search" placeholder="Name or census code" value={search} disabled={!subdistrict} onChange={(e) => setSearch(e.target.value)} />
      </label>
      <label className="field grow">
        <span>Village {subdistrict && !isLoading && `(${shown.length} of ${villages.length})`}</span>
        <select
          value={value?.village_code ?? ""}
          disabled={!subdistrict}
          onChange={(e) => onChange(villages.find((v) => v.village_code === e.target.value) ?? null)}
        >
          <option value="">{isLoading ? "Loading villages…" : "Select village…"}</option>
          {shown.map((v) => {
            const taken = takenCodes.includes(v.village_code);
            return (
              <option key={v.village_code} value={v.village_code} disabled={taken}>
                {v.village_name} ({v.village_code}){v.on_dashboard ? "" : " · not on dashboard yet"}{taken ? " · has supervisor" : ""}
              </option>
            );
          })}
        </select>
      </label>
    </div>
  );
}
