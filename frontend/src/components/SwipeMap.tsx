"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Feature, FeatureCollection } from "geojson";
import { geoJSON, point, type LatLngBounds, type Map as LeafletMap, type PathOptions } from "leaflet";
import { GeoJSON, ImageOverlay, MapContainer, ScaleControl, TileLayer } from "react-leaflet";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEmissionGrid, useGeoJson, useVillageCadastral } from "@/lib/api";
import { paint, scenarioRaster } from "@/lib/emissionGrid";
import { fmt, num } from "@/lib/format";
import type { EmissionGrid, Village } from "@/lib/types";
import { USE_FILLS } from "./CarbonLabScene";

export type SwipeLayer = "total" | "lpg" | "firewood" | "electricity" | "transport" | "waste" | "livestock" | "landcover" | "none";
export type Basemap = "streets" | "satellite";

const BASEMAPS: Record<Basemap, { url: string; attribution: string }> = {
  streets: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: "Esri World Imagery" },
};
const LANDCOVER_FILL: Record<string, string> = { ...USE_FILLS, cropland: "#aed581", land: "#c5e1a5" };
const SOURCES: { key: keyof Village; label: string }[] = [
  { key: "firewood_co2e_t_yr", label: "Firewood" }, { key: "livestock_co2e_t_yr", label: "Livestock" },
  { key: "electricity_co2e_t_yr", label: "Electricity" }, { key: "waste_co2e_t_yr", label: "Solid waste" },
  { key: "lpg_co2e_t_yr", label: "LPG" }, { key: "transport_co2e_t_yr", label: "Transport" },
];

interface SideData {
  village: Village;
  boundary: Feature | null;
  parcels: Feature[];
  grid: EmissionGrid | undefined;
}

/** Boundary (cadastral when available, else census), khasra parcels and emission cells of one village. */
function useSide(village: Village | undefined): SideData | null {
  const code = village?.village_code ?? null;
  const { data: census } = useGeoJson("villages");
  const { data: cadastral } = useVillageCadastral(code);
  const { data: grid } = useEmissionGrid(code);
  return useMemo(() => {
    if (!village) return null;
    const own = cadastral?.features.find((f) => f.properties?.kind === "boundary") ?? null;
    const fallback = census?.features.find((f) => String(f.properties?.village_code ?? "").trim() === village.village_code) ?? null;
    return { village, boundary: own ?? fallback, parcels: cadastral?.features.filter((f) => f.properties?.kind === "parcel") ?? [], grid };
  }, [village, census, cadastral, grid]);
}

function Layers({ side, layer, basemap }: { side: SideData; layer: SwipeLayer; basemap: Basemap }) {
  const { grid, boundary, parcels } = side;
  const url = useMemo(() => {
    if (!grid || layer === "landcover" || layer === "none") return null;
    return paint(grid, scenarioRaster(grid, layer), grid.legends[layer] ?? []);
  }, [grid, layer]);
  const parcelStyle = (f?: Feature): PathOptions => ({
    fillColor: LANDCOVER_FILL[f?.properties?.use] ?? LANDCOVER_FILL.land, fillOpacity: 0.85, color: "#5d4037", weight: 0.3,
  });
  return (
    <>
      <TileLayer url={BASEMAPS[basemap].url} attribution={BASEMAPS[basemap].attribution} />
      {url && grid && (
        <ImageOverlay url={url} className="emission-overlay" opacity={0.85}
          bounds={[[grid.bounds[1], grid.bounds[0]], [grid.bounds[3], grid.bounds[2]]]} />
      )}
      {layer === "landcover" && parcels.length > 0 && (
        <GeoJSON key={`lc-${side.village.village_code}`} data={{ type: "FeatureCollection", features: parcels } as FeatureCollection}
          style={parcelStyle} interactive={false} />
      )}
      {boundary && (
        <GeoJSON key={`b-${side.village.village_code}`} data={boundary} interactive={false}
          style={{ color: basemap === "satellite" ? "#ffeb3b" : "#1b5e20", weight: 2.5, fill: false }} />
      )}
    </>
  );
}

function SideCard({ side, align, layer }: { side: SideData; align: "left" | "right"; layer: SwipeLayer }) {
  const v = side.village;
  const top = SOURCES.reduce((a, b) => (num(v[b.key] as number) > num(v[a.key] as number) ? b : a));
  const missing = layer === "landcover" ? !side.parcels.length : layer !== "none" && !side.grid;
  return (
    <div className={`swipe-card ${align}`}>
      <small>{align === "left" ? "Left" : "Right"} · {v.block_name}</small>
      <b>{v.village_name}</b>
      <dl>
        <div><dt>Total</dt><dd>{fmt(v.total_co2e_t_yr, 0)} t CO₂e/yr</dd></div>
        <div><dt>Per person</dt><dd>{fmt(v.per_capita_co2e_kg_yr, 0)} kg</dd></div>
        <div><dt>Largest source</dt><dd>{top.label}</dd></div>
      </dl>
      {missing && <span className="swipe-missing">{layer === "landcover" ? "No khasra parcels" : "No emission raster"} for this village</span>}
    </div>
  );
}

const boundsOf = (f: Feature | null): LatLngBounds | null => (f ? geoJSON(f).getBounds() : null);

/** Google Earth Engine–style swipe: two villages under one draggable divider, with synced zoom and relative pan. */
export default function SwipeMap({ left, right, layer, basemap }: { left: Village; right: Village; layer: SwipeLayer; basemap: Basemap }) {
  const a = useSide(left);
  const b = useSide(right);
  const [split, setSplit] = useState(50);
  const wrap = useRef<HTMLDivElement>(null);
  const maps = useRef<{ a: LeafletMap | null; b: LeafletMap | null }>({ a: null, b: null });
  const syncing = useRef(false);

  const boundsA = useMemo(() => boundsOf(a?.boundary ?? null), [a?.boundary]);
  const boundsB = useMemo(() => boundsOf(b?.boundary ?? null), [b?.boundary]);

  // Fit both villages at one shared zoom (the smaller of the two fits), each centred on its own village.
  useEffect(() => {
    const ma = maps.current.a, mb = maps.current.b;
    if (!ma || !mb || !boundsA || !boundsB) return;
    const zoom = Math.min(ma.getBoundsZoom(boundsA, false, point(30, 30)), mb.getBoundsZoom(boundsB, false, point(30, 30)));
    syncing.current = true;
    ma.setView(boundsA.getCenter(), zoom, { animate: false });
    mb.setView(boundsB.getCenter(), zoom, { animate: false });
    syncing.current = false;
  }, [boundsA, boundsB]);

  // Panning / zooming one side moves the other by the same offset from its own village centre.
  const follow = (from: "a" | "b") => {
    if (syncing.current || !boundsA || !boundsB) return;
    const src = maps.current[from], dst = maps.current[from === "a" ? "b" : "a"];
    if (!src || !dst) return;
    const [srcC, dstC] = from === "a" ? [boundsA.getCenter(), boundsB.getCenter()] : [boundsB.getCenter(), boundsA.getCenter()];
    const c = src.getCenter();
    syncing.current = true;
    dst.setView([dstC.lat + (c.lat - srcC.lat), dstC.lng + (c.lng - srcC.lng)], src.getZoom(), { animate: false });
    syncing.current = false;
  };
  const bind = (key: "a" | "b") => (m: LeafletMap | null) => {
    if (!m || maps.current[key] === m) return;
    maps.current[key] = m;
    m.on("move zoom", () => follow(key));
  };

  const drag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    const move = (ev: PointerEvent) => setSplit(Math.min(96, Math.max(4, ((ev.clientX - box.left) / box.width) * 100)));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    move(e.nativeEvent);
  };

  return (
    <div className="swipe-wrap" ref={wrap}>
      <MapContainer ref={bind("a")} center={[25.32, 82.97]} zoom={13} className="swipe-map" zoomControl={false} attributionControl={false}>
        {a && <Layers side={a} layer={layer} basemap={basemap} />}
        <ScaleControl position="bottomleft" imperial={false} />
      </MapContainer>
      <div className="swipe-top" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
        <MapContainer ref={bind("b")} center={[25.32, 82.97]} zoom={13} className="swipe-map" zoomControl>
          {b && <Layers side={b} layer={layer} basemap={basemap} />}
        </MapContainer>
      </div>
      <div className="swipe-divider" style={{ left: `${split}%` }}>
        <button type="button" className="swipe-handle" onPointerDown={drag} aria-label="Drag to compare the two villages"
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setSplit((s) => Math.max(4, s - 4));
            if (e.key === "ArrowRight") setSplit((s) => Math.min(96, s + 4));
          }}>
          <ChevronLeft size={14} /><ChevronRight size={14} />
        </button>
      </div>
      {a && <SideCard side={a} align="left" layer={layer} />}
      {b && <SideCard side={b} align="right" layer={layer} />}
    </div>
  );
}
