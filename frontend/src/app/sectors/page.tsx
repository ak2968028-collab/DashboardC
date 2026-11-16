"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, type ComponentType, type CSSProperties, type KeyboardEvent } from "react";
import { SECTORS } from "@/components/nav";
import Demography from "@/components/sectors/Demography";
import Energy from "@/components/sectors/Energy";
import LandWater from "@/components/sectors/LandWater";
import Livestock from "@/components/sectors/Livestock";
import Transport from "@/components/sectors/Transport";
import Waste from "@/components/sectors/Waste";

const VIEWS: Record<string, ComponentType> = {
  demography: Demography,
  "land-water": LandWater,
  energy: Energy,
  transport: Transport,
  waste: Waste,
  livestock: Livestock,
};

export default function SectorsPage() {
  // useSearchParams needs a Suspense boundary when the route is prerendered.
  return (
    <Suspense fallback={<div className="loading">Loading sector…</div>}>
      <Sectors />
    </Suspense>
  );
}

/** All six village sectors on one page; the open tab lives in ?s= so it can be linked and survives reloads. */
function Sectors() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabsRef = useRef<HTMLDivElement>(null);

  const current = SECTORS.find((s) => s.key === params.get("s")) ?? SECTORS[0];
  const View = VIEWS[current.key];

  const select = (key: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("s", key);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onKeyDown = (e: KeyboardEvent) => {
    const i = SECTORS.indexOf(current);
    const step = { ArrowRight: 1, ArrowLeft: -1, Home: -i, End: SECTORS.length - 1 - i }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const to = SECTORS[(i + step + SECTORS.length) % SECTORS.length];
    select(to.key);
    tabsRef.current?.querySelector<HTMLButtonElement>(`[data-key="${to.key}"]`)?.focus();
  };

  return (
    <>
      <div ref={tabsRef} className="sector-tabs" role="tablist" aria-label="Sectors" onKeyDown={onKeyDown}>
        {SECTORS.map((s) => {
          const active = s.key === current.key;
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              id={`sector-tab-${s.key}`}
              data-key={s.key}
              aria-selected={active}
              aria-controls="sector-panel"
              tabIndex={active ? 0 : -1}
              title={s.hint}
              className={`sector-tab ${active ? "active" : ""}`}
              style={{ "--sector": s.accentColor } as CSSProperties}
              onClick={() => select(s.key)}
            >
              <span className="sector-tab-icon"><s.icon size={16} /></span>
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>
      <p className="sector-hint">{current.hint}</p>
      <div id="sector-panel" role="tabpanel" aria-labelledby={`sector-tab-${current.key}`}>
        <View />
      </div>
    </>
  );
}
