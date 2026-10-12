"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection } from "geojson";
import type { Layer, PathOptions } from "leaflet";
import {
  CircleMarker, GeoJSON, LayersControl, MapContainer, Pane, Popup, ScaleControl, TileLayer, WMSTileLayer, useMap, useMapEvents,
} from "react-leaflet";
import { Maximize } from "lucide-react";
import { useGeoJson, useRasterLayers, wmsLegendUrl, wmsUrl } from "@/lib/api";
import { interpolate } from "@/lib/colors";
import { fmt, num } from "@/lib/format";
import type { NumericKey, RasterLayer, Village } from "@/lib/types";

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

const DISTRICT_CENTER: [number, number] = [25.37, 82.93];

interface Props {
  villages: Village[];
  selectedCode: string | null;
  blockFilter: string | null;
  metric: ThematicMetric;
  onSelect: (code: string) => void;
}

const featureCode = (f: Feature) => String(f.properties?.village_code ?? "").trim();

export default function VillageMap({ villages, selectedCode, blockFilter, metric, onSelect }: Props) {
  const { data: villageGeo } = useGeoJson("villages");
  const { data: blockGeo } = useGeoJson("blocks");
  const { data: districtGeo } = useGeoJson("district");
  const { data: rasters = [] } = useRasterLayers();
  const [activeRasters, setActiveRasters] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const byCode = useMemo(() => new Map(villages.map((v) => [v.village_code, v])), [villages]);

  // Village polygons limited to the block filter.
  const displayGeo = useMemo<FeatureCollection | null>(() => {
    if (!villageGeo) return null;
    const features = blockFilter
      ? villageGeo.features.filter((f) => byCode.get(featureCode(f))?.block_name === blockFilter)
      : villageGeo.features;
    return { ...villageGeo, features: features.length ? features : villageGeo.features };
  }, [villageGeo, byCode, blockFilter]);

  const [min, max] = useMemo(() => {
    if (!displayGeo) return [0, 0];
    const vals = displayGeo.features.map((f) => num(byCode.get(featureCode(f))?.[metric.col]));
    return [Math.min(...vals), Math.max(...vals)];
  }, [displayGeo, byCode, metric]);

  const style = (feature?: Feature): PathOptions => {
    const code = feature ? featureCode(feature) : "";
    if (code === selectedCode) return { fillColor: "#ffd600", color: "#e65100", weight: 4, fillOpacity: 0.85 };
    const val = num(byCode.get(code)?.[metric.col]);
    const fillColor = max > min ? interpolate(metric.colors, (val - min) / (max - min)) : "#a5d6a7";
    return { fillColor, color: "#37474f", weight: 0.7, fillOpacity: 0.65 };
  };

  const onEachFeature = (feature: Feature, layer: Layer) => {
    const v = byCode.get(featureCode(feature));
    if (!v) return;
    layer.bindTooltip(
      `<b>Village:</b> ${v.village_name}<br><b>Block:</b> ${v.block_name}<br><b>Census Code:</b> ${v.village_code}` +
        `<br><b>Residents:</b> ${fmt(v.total_residents)}<br><b>Area (ha):</b> ${fmt(v.total_area_ha, 1)}` +
        `<br><b>${metric.caption}:</b> ${fmt(v[metric.col], 1)}`,
      { sticky: true }
    );
    layer.on("click", () => onSelect(v.village_code));
  };

  const selected = selectedCode ? byCode.get(selectedCode) : undefined;
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else containerRef.current?.requestFullscreen();
  };

  return (
    <div className="map-wrap" ref={containerRef}>
      <MapContainer center={DISTRICT_CENTER} zoom={10} preferCanvas className="map">
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="OpenStreetMap">
            <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite Imagery (Esri)">
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Esri Satellite World Imagery" />
          </LayersControl.BaseLayer>

          {districtGeo && (
            <LayersControl.Overlay checked name="Varanasi District Boundary">
              <GeoJSON data={districtGeo} interactive={false} style={{ fillColor: "transparent", fillOpacity: 0, color: "#1a237e", weight: 3, dashArray: "6, 6" }} />
            </LayersControl.Overlay>
          )}
          {displayGeo && (
            <LayersControl.Overlay checked name="Varanasi Villages">
              {/* Remount when styling inputs change so every polygon is restyled. */}
              <GeoJSON key={`${metric.col}|${blockFilter}|${selectedCode}|${villages.length}`} data={displayGeo} style={style} onEachFeature={onEachFeature} />
            </LayersControl.Overlay>
          )}
          {rasters.map((r) => (
            <LayersControl.Overlay key={r.layer} name={rasterOverlayName(r)}>
              {/* Own pane above the village polygons; clicks pass through to the villages. */}
              <Pane name={`raster-${r.name}`} style={{ zIndex: 450, pointerEvents: "none" }}>
                <WMSTileLayer url={wmsUrl(r.workspace)} params={{ layers: r.layer, format: "image/png", transparent: true }} opacity={0.8} />
              </Pane>
            </LayersControl.Overlay>
          ))}
          {blockGeo && (
            <LayersControl.Overlay checked name="Block Boundaries">
              <GeoJSON
                data={blockGeo}
                interactive={false}
                style={{ fillColor: "transparent", fillOpacity: 0, color: "#d84315", weight: 2, dashArray: "3, 4" }}
              />
            </LayersControl.Overlay>
          )}
        </LayersControl>

        {selected?.latitude != null && selected.longitude != null && (
          <CircleMarker center={[selected.latitude, selected.longitude]} radius={7} pathOptions={{ color: "#fff", weight: 2, fillColor: "#d32f2f", fillOpacity: 1 }}>
            <Popup>
              <b>Selected: {selected.village_name}</b><br />Block: {selected.block_name}<br />Total CO₂e: {fmt(selected.total_co2e_t_yr, 1)} t/yr
            </Popup>
          </CircleMarker>
        )}
        <ScaleControl position="bottomleft" />
        <ActiveOverlayTracker onChange={setActiveRasters} />
        <FlyToSelection village={selected} blockFilter={blockFilter} />
      </MapContainer>

      <button className="map-fullscreen" onClick={toggleFullscreen} title="Toggle fullscreen"><Maximize size={16} /></button>
      {activeRasters.length > 0 && (
        <div className="map-legend raster-legend">
          {rasters.filter((r) => activeRasters.includes(rasterOverlayName(r))).map((r) => (
            <div key={r.layer}>
              <div className="legend-title">{r.title}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={wmsLegendUrl(r)} alt={`${r.title} legend`} />
            </div>
          ))}
        </div>
      )}
      {max > min && (
        <div className="map-legend">
          <div className="legend-title">{metric.caption}</div>
          <div className="legend-bar" style={{ background: `linear-gradient(to right, ${metric.colors.join(",")})` }} />
          <div className="legend-range"><span>{fmt(min, 1)}</span><span>{fmt(max, 1)}</span></div>
        </div>
      )}
    </div>
  );
}

const rasterOverlayName = (r: RasterLayer) => `Raster: ${r.title}`;

/** Reports which layer-control overlays are switched on (for the raster legends). */
function ActiveOverlayTracker({ onChange }: { onChange: (update: (names: string[]) => string[]) => void }) {
  useMapEvents({
    overlayadd: (e) => onChange((names) => [...names, e.name]),
    overlayremove: (e) => onChange((names) => names.filter((n) => n !== e.name)),
  });
  return null;
}

function FlyToSelection({ village, blockFilter }: { village?: Village; blockFilter: string | null }) {
  const map = useMap();
  useEffect(() => {
    if (village?.latitude != null && village.longitude != null) {
      map.flyTo([village.latitude, village.longitude], 13, { duration: 0.6 });
    } else {
      map.setView(DISTRICT_CENTER, blockFilter ? 11 : 10);
    }
  }, [map, village?.village_code, village?.latitude, village?.longitude, blockFilter]);
  return null;
}
