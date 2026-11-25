"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection } from "geojson";
import type { Layer, Map as LeafletMap, PathOptions } from "leaflet";
import {
  CircleMarker, GeoJSON, MapContainer, Pane, Popup, ScaleControl, TileLayer, WMSTileLayer, ZoomControl, useMap,
} from "react-leaflet";
import { Layers, Maximize2, Minimize2 } from "lucide-react";
import { useGeoJson, useRasterLayers, wmsLegendUrl, wmsUrl } from "@/lib/api";
import { interpolate } from "@/lib/colors";
import { fmt, num } from "@/lib/format";
import type { NumericKey, RasterLayer, Village } from "@/lib/types";
import { useDashboard } from "./DashboardContext";
import IndiaStatesLayer from "./IndiaStatesLayer";

export type BaseMapId = "streets" | "topo" | "satellite" | "none";

export interface ThematicMetric {
  label: string;
  col: NumericKey;
  colors: string[];
  caption: string;
}

export const THEMATIC_METRICS: ThematicMetric[] = [
  { label: "Total Carbon Emission (t CO2e/yr)", col: "total_co2e_t_yr", colors: ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"], caption: "Total GHG Emission (t CO2e/yr)" },
  { label: "Per Capita Emission (kg CO2e/person/yr)", col: "per_capita_co2e_kg_yr", colors: ["#e0f3f8", "#99d594", "#fee08b", "#fc8d59", "#d53e4f"], caption: "Per Capita GHG (kg CO2e/yr)" },
  { label: "Agricultural Area (ha)", col: "agri_area_ha", colors: ["#edf8e9", "#bae4b3", "#74c476", "#31a354", "#006d2c"], caption: "Net Sown Agricultural Area (ha)" },
  { label: "Electricity Consumption (kWh/month)", col: "electricity_monthly_kwh", colors: ["#eff3ff", "#bdd7e7", "#6baed6", "#3182bd", "#08519c"], caption: "Electricity Consumption (kWh/mo)" },
  { label: "Solid Waste Generation (kg/month)", col: "waste_monthly_kg", colors: ["#fee5d9", "#fcae91", "#fb6a4a", "#de2d26", "#a50f15"], caption: "Solid Waste Generated (kg/mo)" },
  { label: "Livestock Population (Count)", col: "total_livestock", colors: ["#f2f0f7", "#cbc9e2", "#9e9ac8", "#756bb1", "#54278f"], caption: "Total Livestock (Cattle/Goats/Sheep)" },
];

export const BASE_MAPS: { id: BaseMapId; label: string; url: string; attribution: string }[] = [
  {
    id: "streets",
    label: "Streets & Places",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  {
    id: "topo",
    label: "Topographic Map",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Esri, HERE, Garmin, Intermap, USGS",
  },
  {
    id: "satellite",
    label: "Satellite Imagery",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Esri Satellite World Imagery",
  },
  {
    id: "none",
    label: "None",
    url: "",
    attribution: "",
  },
];

const DISTRICT_CENTER: [number, number] = [25.37, 82.93];

interface Props {
  villages: Village[];
  selectedCode: string | null;
  /** Only these villages are drawn (the selected sub-district); null draws every village. */
  areaFilter: { label: string; codes: Set<string> } | null;
  metricIdx: number;
  onMetricChange: (idx: number) => void;
  onSelect: (code: string) => void;
  baseMap: BaseMapId;
  showDistrictBoundary: boolean;
  showBlockBoundaries: boolean;
  showVillages: boolean;
  activeRasters: string[];
  rasters?: RasterLayer[];
  zoomRequest?: { target: "district" | "village"; seq: number } | null;
  layoutTick?: number;
  fullscreenSeq?: number;
}

const featureCode = (f: Feature) => String(f.properties?.village_code ?? "").trim();

export default function VillageMap({
  villages,
  selectedCode,
  areaFilter,
  metricIdx,
  onMetricChange,
  onSelect,
  baseMap,
  showDistrictBoundary,
  showBlockBoundaries,
  showVillages,
  activeRasters,
  rasters: rastersProp,
  zoomRequest,
  layoutTick = 0,
  fullscreenSeq = 0,
}: Props) {
  const { data: villageGeo } = useGeoJson("villages");
  const { data: blockGeo } = useGeoJson("blocks");
  const { data: districtGeo } = useGeoJson("district");
  const { data: fetchedRasters = [] } = useRasterLayers();
  const rasters = rastersProp ?? fetchedRasters;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const metric = THEMATIC_METRICS[metricIdx] ?? THEMATIC_METRICS[0];
  const activeBase = BASE_MAPS.find((b) => b.id === baseMap) ?? BASE_MAPS[0];

  useEffect(() => {
    const handleFsChange = () => {
      const isFs = Boolean(document.fullscreenElement && document.fullscreenElement === containerRef.current);
      setIsFullscreen(isFs);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (containerRef.current?.requestFullscreen) {
      containerRef.current.requestFullscreen().catch(() => {
        setIsFullscreen((prev) => !prev);
      });
    } else {
      setIsFullscreen((prev) => !prev);
    }
  };

  useEffect(() => {
    if (fullscreenSeq > 0) toggleFullscreen();
  }, [fullscreenSeq]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "f" || e.key === "F") && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        toggleFullscreen();
      } else if (e.key === "Escape" && isFullscreen && !document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  const { showCodes } = useDashboard();
  const byCode = useMemo(() => new Map(villages.map((v) => [v.village_code, v])), [villages]);

  // Village polygons limited to the selected area.
  const displayGeo = useMemo<FeatureCollection | null>(() => {
    if (!villageGeo) return null;
    const features = areaFilter
      ? villageGeo.features.filter((f) => areaFilter.codes.has(featureCode(f)))
      : villageGeo.features;
    return { ...villageGeo, features: features.length ? features : villageGeo.features };
  }, [villageGeo, areaFilter]);

  const [min, max] = useMemo(() => {
    if (!displayGeo) return [0, 0];
    const vals = displayGeo.features.map((f) => num(byCode.get(featureCode(f))?.[metric.col]));
    return [Math.min(...vals), Math.max(...vals)];
  }, [displayGeo, byCode, metric]);

  const style = (feature?: Feature): PathOptions => {
    const code = feature ? featureCode(feature) : "";
    if (code === selectedCode) return { fillColor: "#ffd600", color: "#e65100", weight: 3.5, fillOpacity: 0.85 };
    const val = num(byCode.get(code)?.[metric.col]);
    const fillColor = max > min ? interpolate(metric.colors, (val - min) / (max - min)) : "#a5d6a7";
    return { fillColor, color: "#37474f", weight: 0.7, fillOpacity: 0.65 };
  };

  const onEachFeature = (feature: Feature, layer: Layer) => {
    const v = byCode.get(featureCode(feature));
    if (!v) return;
    layer.bindTooltip(
      `<b>Village:</b> ${v.village_name}<br><b>Block:</b> ${v.block_name}` +
        (showCodes ? `<br><b>Census Code:</b> ${v.village_code}` : "") +
        `<br><b>Residents:</b> ${fmt(v.total_residents)}<br><b>Area (ha):</b> ${fmt(v.total_area_ha, 1)}` +
        `<br><b>${metric.caption}:</b> ${fmt(v[metric.col], 1)}`,
      { sticky: true }
    );
    layer.on("click", () => onSelect(v.village_code));
  };

  const selected = selectedCode ? byCode.get(selectedCode) : undefined;
  const enabledRasterObjects = useMemo(
    () => rasters.filter((r) => activeRasters.includes(r.layer)),
    [rasters, activeRasters]
  );

  // Clip raster layers to the selected sub-district polygons (if filtered) or the Varanasi district boundary.
  const clipGeo = areaFilter && displayGeo ? displayGeo : districtGeo;
  const rawClipId = useId();
  const clipId = `raster-clip-${rawClipId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [clipPaths, setClipPaths] = useState<string[]>([]);
  const [isRasterZooming, setIsRasterZooming] = useState(false);

  return (
    <div className={`map-wrap scalgo-map-wrap ${isFullscreen ? "is-fullscreen" : ""} ${baseMap === "none" ? "no-basemap" : ""}`} ref={containerRef}>
      <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}>
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            {clipPaths.map((d, i) => (
              <path key={i} d={d} clipRule="evenodd" />
            ))}
          </clipPath>
        </defs>
      </svg>

      <MapContainer center={DISTRICT_CENTER} zoom={10} zoomControl={false} preferCanvas className="map scalgo-map">
        <ZoomControl position="topleft" />
        <IndiaStatesLayer />
        {activeBase.url && (
          <TileLayer key={activeBase.id} url={activeBase.url} attribution={activeBase.attribution} />
        )}

        {showDistrictBoundary && districtGeo && (
          <GeoJSON
            data={districtGeo}
            interactive={false}
            style={{ fillColor: "transparent", fillOpacity: 0, color: "#1a237e", weight: 3, dashArray: "6, 6" }}
          />
        )}

        {showVillages && displayGeo && (
          <GeoJSON
            key={`${metric.col}|${areaFilter?.label ?? ""}|${selectedCode}|${villages.length}|${showCodes}`}
            data={displayGeo}
            style={style}
            onEachFeature={onEachFeature}
          />
        )}

        <Pane
          name="clipped-rasters"
          style={{
            zIndex: 450,
            pointerEvents: "none",
            clipPath: clipPaths.length > 0 ? `url(#${clipId})` : undefined,
            opacity: isRasterZooming || (enabledRasterObjects.length > 0 && clipGeo && clipPaths.length === 0) ? 0 : 1,
          }}
        >
          {enabledRasterObjects.map((r) => (
            <WMSTileLayer
              key={r.layer}
              url={wmsUrl(r.workspace)}
              params={{ layers: r.layer, format: "image/png", transparent: true }}
              opacity={0.8}
            />
          ))}
        </Pane>
        <ClipPathSync clipGeo={clipGeo} onPaths={setClipPaths} onZooming={setIsRasterZooming} />

        {showBlockBoundaries && blockGeo && (
          <GeoJSON
            data={blockGeo}
            interactive={false}
            style={{ fillColor: "transparent", fillOpacity: 0, color: "#d84315", weight: 2, dashArray: "3, 4" }}
          />
        )}

        {selected?.latitude != null && selected.longitude != null && (
          <CircleMarker center={[selected.latitude, selected.longitude]} radius={7} pathOptions={{ color: "#fff", weight: 2, fillColor: "#d32f2f", fillOpacity: 1 }}>
            <Popup>
              <b>Selected: {selected.village_name}</b><br />Block: {selected.block_name}<br />Total CO₂e: {fmt(selected.total_co2e_t_yr, 1)} t/yr
            </Popup>
          </CircleMarker>
        )}

        <ScaleControl position="bottomleft" />
        <FlyToSelection village={selected} zoomed={!!areaFilter} zoomRequest={zoomRequest} />
        <MapResizeTrigger trigger={`${isFullscreen}-${layoutTick}`} />
      </MapContainer>

      {/* Floating Thematic Map Layer Dropdown on Top-Right of Map */}
      <div className="map-thematic-float" role="region" aria-label="Thematic Map Layer">
        <div className="map-thematic-head">
          <Layers size={13} />
          <span>Thematic Map Layer</span>
        </div>
        <select
          className="map-thematic-select"
          aria-label="Select Thematic Map Layer"
          value={metricIdx}
          onChange={(e) => onMetricChange(Number(e.target.value))}
        >
          {THEMATIC_METRICS.map((m, i) => (
            <option key={m.col} value={i}>{m.label}</option>
          ))}
        </select>
        <div
          className="map-thematic-ramp"
          style={{ background: `linear-gradient(to right, ${metric.colors.join(",")})` }}
          title={metric.caption}
        />
      </div>

      {/* Fullscreen button under zoom controls */}
      <button
        type="button"
        className={`map-fullscreen ${isFullscreen ? "is-active" : ""}`}
        onClick={toggleFullscreen}
        title={isFullscreen ? "Exit Full Screen (Esc / F)" : "Full Screen Map (F)"}
        aria-label={isFullscreen ? "Exit Full Screen" : "Full Screen Map"}
      >
        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>

      {/* Active Raster Legends */}
      {enabledRasterObjects.length > 0 && (
        <div className="map-legend raster-legend">
          {enabledRasterObjects.map((r) => (
            <div key={r.layer}>
              <div className="legend-title">{r.title}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={wmsLegendUrl(r)} alt={`${r.title} legend`} />
            </div>
          ))}
        </div>
      )}

      {/* Thematic Gradient Legend */}
      {showVillages && max > min && (
        <div className="map-legend">
          <div className="legend-title">{metric.caption}</div>
          <div className="legend-bar" style={{ background: `linear-gradient(to right, ${metric.colors.join(",")})` }} />
          <div className="legend-range"><span>{fmt(min, 1)}</span><span>{fmt(max, 1)}</span></div>
        </div>
      )}
    </div>
  );
}

function FlyToSelection({
  village,
  zoomed,
  zoomRequest,
}: {
  village?: Village;
  zoomed: boolean;
  zoomRequest?: { target: "district" | "village"; seq: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (village?.latitude != null && village.longitude != null) {
      map.flyTo([village.latitude, village.longitude], 13, { duration: 0.6 });
    } else {
      map.setView(DISTRICT_CENTER, zoomed ? 11 : 10);
    }
  }, [map, village?.village_code, village?.latitude, village?.longitude, zoomed]);

  useEffect(() => {
    if (!zoomRequest) return;
    if (zoomRequest.target === "district") {
      map.flyTo(DISTRICT_CENTER, 10, { duration: 0.5 });
    } else if (zoomRequest.target === "village" && village?.latitude != null && village.longitude != null) {
      map.flyTo([village.latitude, village.longitude], 13, { duration: 0.5 });
    }
  }, [map, zoomRequest, village?.latitude, village?.longitude]);

  return null;
}

function ringToPath(map: LeafletMap, ring: number[][]): string {
  if (!ring.length) return "";
  let d = "";
  for (let i = 0; i < ring.length; i++) {
    const [lng, lat] = ring[i];
    const pt = map.latLngToLayerPoint([lat, lng]);
    d += `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
  }
  return d ? `${d}Z` : "";
}

function geoToPaths(map: LeafletMap, geo: FeatureCollection | null | undefined): string[] {
  if (!geo?.features?.length) return [];
  const paths: string[] = [];
  for (const f of geo.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "Polygon") {
      const d = g.coordinates.map((ring) => ringToPath(map, ring)).join(" ");
      if (d) paths.push(d);
    } else if (g.type === "MultiPolygon") {
      for (const poly of g.coordinates) {
        const d = poly.map((ring) => ringToPath(map, ring)).join(" ");
        if (d) paths.push(d);
      }
    }
  }
  return paths;
}

/** Keeps the SVG clip-path synchronized with Leaflet layer coordinates for the selected district or sub-district. */
function ClipPathSync({
  clipGeo,
  onPaths,
  onZooming,
}: {
  clipGeo: FeatureCollection | null | undefined;
  onPaths: (paths: string[]) => void;
  onZooming: (zooming: boolean) => void;
}) {
  const map = useMap();

  const recompute = useCallback(() => {
    onPaths(geoToPaths(map, clipGeo));
  }, [map, clipGeo, onPaths]);

  useEffect(() => {
    recompute();
  }, [recompute]);

  useEffect(() => {
    const onZoomStart = () => onZooming(true);
    const onZoomEnd = () => {
      recompute();
      onZooming(false);
    };
    map.on("zoomstart", onZoomStart);
    map.on("zoomend", onZoomEnd);
    map.on("viewreset", onZoomEnd);
    map.on("moveend", recompute);
    map.on("resize", recompute);
    return () => {
      map.off("zoomstart", onZoomStart);
      map.off("zoomend", onZoomEnd);
      map.off("viewreset", onZoomEnd);
      map.off("moveend", recompute);
      map.off("resize", recompute);
    };
  }, [map, recompute, onZooming]);

  return null;
}

/** Triggers leaflet resize when entering/exiting fullscreen or toggling side panels. */
function MapResizeTrigger({ trigger }: { trigger: string }) {
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
