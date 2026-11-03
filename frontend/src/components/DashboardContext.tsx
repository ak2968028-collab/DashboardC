"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useVillage, useVillages } from "@/lib/api";
import type { Village, VillageDetails } from "@/lib/types";

export const ALL_BLOCKS = "All Blocks";
const DEFAULT_VILLAGE = "208818"; // Ausanpur
const STORAGE_KEY = "varanasi-dashboard-selection";
const RECENT_LIMIT = 6;

interface DashboardState {
  allVillages: Village[];
  /** Villages in the selected block (all villages when "All Blocks"). */
  filteredVillages: Village[];
  selectedBlock: string;
  setSelectedBlock: (block: string) => void;
  selectedCode: string | null;
  setSelectedCode: (code: string) => void;
  activeVillage: VillageDetails | undefined;
  /** Census codes are hidden on the dashboard until the viewer chooses to show them. */
  showCodes: boolean;
  setShowCodes: (show: boolean) => void;
  /** Recently viewed village codes, newest first. */
  recentCodes: string[];
  loading: boolean;
  error: Error | undefined;
}

const DashboardContext = createContext<DashboardState | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { data: rawVillages = [], isLoading, error } = useVillages();
  const allVillages = useMemo(
    () => [...rawVillages].sort((a, b) => a.village_name.localeCompare(b.village_name)),
    [rawVillages]
  );
  const [selectedBlock, setBlock] = useState(ALL_BLOCKS);
  const [selectedCode, setSelectedCode] = useState<string>(DEFAULT_VILLAGE);
  const [showCodes, setShowCodes] = useState(false);
  const [recentCodes, setRecentCodes] = useState<string[]>([]);
  const [restored, setRestored] = useState(false);

  // Restore the last selection and viewing preferences for this browser.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.block) setBlock(saved.block);
      if (saved?.village) setSelectedCode(saved.village);
      if (typeof saved?.showCodes === "boolean") setShowCodes(saved.showCodes);
      if (Array.isArray(saved?.recent)) setRecentCodes(saved.recent.filter((c: unknown) => typeof c === "string"));
    } catch {}
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(
        { block: selectedBlock, village: selectedCode, showCodes, recent: recentCodes },
      ));
    } catch {}
  }, [restored, selectedBlock, selectedCode, showCodes, recentCodes]);

  // Remember viewed villages for the quick "recent" list in the village search.
  useEffect(() => {
    if (!restored || !selectedCode) return;
    setRecentCodes((list) => [selectedCode, ...list.filter((c) => c !== selectedCode)].slice(0, RECENT_LIMIT));
  }, [restored, selectedCode]);

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
        showCodes,
        setShowCodes,
        recentCodes,
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
