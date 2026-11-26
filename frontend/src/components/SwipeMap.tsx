"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import type { Feature, FeatureCollection } from "geojson";
import { geoJSON, point, type LatLngBounds, type Map as LeafletMap, type PathOptions } from "leaflet";
import { GeoJSON, ImageOverlay, MapContainer, ScaleControl, TileLayer, useMap } from "react-leaflet";
import { useEmissionGrid, useGeoJson, useVillageCadastral } from "@/lib/api";
import { paint, scenarioRaster } from "@/lib/emissionGrid";
import { fmt, num } from "@/lib/format";
import type { EmissionGrid, Village } from "@/lib/types";
import { USE_FILLS } from "./CarbonLabScene";
import IndiaStatesLayer from "./IndiaStatesLayer";

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
      <TileLayer key={basemap} url={BASEMAPS[basemap].url} attribution={BASEMAPS[basemap].attribution} />
      {url && grid && (
        <ImageOverlay url={url} className="emission-overlay" opacity={0.85}
          bounds={[[grid.bounds[1], grid.bounds[0]], [grid.bounds[3], grid.bounds[2]]]} />
      )}
      {layer === "landcover" && parcels.length > 0 && (
        <GeoJSON key={`lc-${side.village.village_code}`} data={{ type: "FeatureCollection", features: parcels } as FeatureCollection}
          style={parcelStyle} interactive={false} />
      )}
      {boundary && (
        <GeoJSON key={`b-${side.village.village_code}-${basemap}`} data={boundary} interactive={false}
          style={{ color: basemap === "satellite" ? "#ffeb3b" : "#1b5e20", weight: 2.5, fill: false }} />
      )}
    </>
  );
}

const boundsOf = (f: Feature | null): LatLngBounds | null => (f ? geoJSON(f).getBounds() : null);

function MapInvalidate({ trigger }: { trigger: number }) {
  const map = useMap();
  useEffect(() => {
    const t1 = setTimeout(() => map.invalidateSize(), 60);
    const t2 = setTimeout(() => map.invalidateSize(), 260);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [map, trigger]);
  return null;
}

/** Two independent side-by-side village maps (Left Map & Right Map) with optional synced zoom. */
export default function SwipeMap({
  left,
  right,
  layer,
  basemap,
  syncZoom = true,
  layoutTick = 0,
}: {
  left: Village;
  right: Village;
  layer: SwipeLayer;
  basemap: Basemap;
  syncZoom?: boolean;
  layoutTick?: number;
}) {
  const a = useSide(left);
  const b = useSide(right);
  const maps = useRef<{ a: LeafletMap | null; b: LeafletMap | null }>({ a: null, b: null });
  const syncing = useRef(false);

  const boundsA = useMemo(() => boundsOf(a?.boundary ?? null), [a?.boundary]);
  const boundsB = useMemo(() => boundsOf(b?.boundary ?? null), [b?.boundary]);

  useEffect(() => {
    const ma = maps.current.a, mb = maps.current.b;
    if (!ma || !mb) return;
    syncing.current = true;
    if (boundsA && boundsB && syncZoom) {
      const zoom = Math.min(ma.getBoundsZoom(boundsA, false, point(24, 24)), mb.getBoundsZoom(boundsB, false, point(24, 24)));
      ma.setView(boundsA.getCenter(), zoom, { animate: false });
      mb.setView(boundsB.getCenter(), zoom, { animate: false });
    } else {
      if (boundsA) ma.fitBounds(boundsA, { padding: [24, 24], animate: false });
      if (boundsB) mb.fitBounds(boundsB, { padding: [24, 24], animate: false });
    }
    syncing.current = false;
  }, [boundsA, boundsB, syncZoom]);

  const onZoomFrom = (from: "a" | "b") => {
    if (!syncZoom || syncing.current) return;
    const src = maps.current[from], dst = maps.current[from === "a" ? "b" : "a"];
    if (!src || !dst) return;
    if (dst.getZoom() !== src.getZoom()) {
      syncing.current = true;
      dst.setZoom(src.getZoom(), { animate: false });
      syncing.current = false;
    }
  };

  const bind = (key: "a" | "b") => (m: LeafletMap | null) => {
    if (!m || maps.current[key] === m) return;
    maps.current[key] = m;
    m.on("zoomend", () => onZoomFrom(key));
  };

  const renderPane = (side: SideData | null, key: "a" | "b", label: string) => {
    const v = side?.village;
    const top = v ? SOURCES.reduce((x, y) => (num(v[y.key] as number) > num(v[x.key] as number) ? y : x)) : null;
    const missing = side ? (layer === "landcover" ? !side.parcels.length : layer !== "none" && !side.grid) : false;

    return (
      <div className="dual-map-pane">
        {v && (
          <div className="dual-map-header">
            <div className="dual-map-title-group">
              <span className={`dual-map-pill ${key === "a" ? "left" : "right"}`}>{label}</span>
              <div>
                <b>{v.village_name}</b>
                <small>{v.block_name} Block</small>
              </div>
            </div>
            <div className="dual-map-stats">
              <span><b>{fmt(v.total_co2e_t_yr, 0)}</b> t/yr</span>
              <span><b>{fmt(v.per_capita_co2e_kg_yr, 0)}</b> kg/person</span>
              {top && <span>Top: <b>{top.label}</b></span>}
            </div>
          </div>
        )}
        <div className="dual-map-canvas">
          <MapContainer
            ref={bind(key)}
            center={[v?.latitude ?? 25.32, v?.longitude ?? 82.97]}
            zoom={13}
            className="dual-map-leaflet"
            zoomControl
          >
            <IndiaStatesLayer />
            {side && <Layers side={side} layer={layer} basemap={basemap} />}
            <ScaleControl position="bottomleft" imperial={false} />
            <MapInvalidate trigger={layoutTick} />
          </MapContainer>
          {missing && (
            <div className="dual-map-missing">
              {layer === "landcover" ? "No khasra parcels for this village" : "No emission raster for this village"}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="dual-map-grid">
      {renderPane(a, "a", "Left Map")}
      {renderPane(b, "b", "Right Map")}
    </div>
  );
}
