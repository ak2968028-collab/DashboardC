"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useVillage, useVillages } from "@/lib/api";
import type { Village, VillageDetails } from "@/lib/types";

export const ALL_BLOCKS = "All Blocks";
const DEFAULT_VILLAGE = "208818"; // Ausanpur
const STORAGE_KEY = "varanasi-dashboard-selection";

interface DashboardState {
  allVillages: Village[];
  /** Villages in the selected block (all villages when "All Blocks"). */
  filteredVillages: Village[];
  selectedBlock: string;
  setSelectedBlock: (block: string) => void;
  selectedCode: string | null;
  setSelectedCode: (code: string) => void;
  activeVillage: VillageDetails | undefined;
  loading: boolean;
  error: Error | undefined;
}

const DashboardContext = createContext<DashboardState | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { data: allVillages = [], isLoading, error } = useVillages();
  const [selectedBlock, setBlock] = useState(ALL_BLOCKS);
  const [selectedCode, setSelectedCode] = useState<string>(DEFAULT_VILLAGE);

  // Restore the last selection for this browser.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.block) setBlock(saved.block);
      if (saved?.village) setSelectedCode(saved.village);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ block: selectedBlock, village: selectedCode }));
    } catch {}
  }, [selectedBlock, selectedCode]);

  const filteredVillages = useMemo(
    () => (selectedBlock === ALL_BLOCKS ? allVillages : allVillages.filter((v) => v.block_name === selectedBlock)),
    [allVillages, selectedBlock]
  );

  // Keep the selected village inside the current block filter.
  const effectiveCode = useMemo(() => {
    if (!filteredVillages.length) return selectedCode;
    return filteredVillages.some((v) => v.village_code === selectedCode)
      ? selectedCode
      : filteredVillages[0].village_code;
  }, [filteredVillages, selectedCode]);

  const { data: activeVillage } = useVillage(allVillages.length ? effectiveCode : null);

  const setSelectedBlock = (block: string) => {
    setBlock(block);
    const first = allVillages.find((v) => v.block_name === block);
    if (block !== ALL_BLOCKS && first) setSelectedCode(first.village_code);
  };

  return (
    <DashboardContext.Provider
      value={{
        allVillages,
        filteredVillages,
        selectedBlock,
        setSelectedBlock,
        selectedCode: effectiveCode,
        setSelectedCode,
        activeVillage,
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

export const villageLabel = (v: Village) => `${v.village_name} (${v.block_name} - ${v.village_code})`;
