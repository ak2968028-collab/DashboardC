"use client";

import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "@/lib/leafletGlobal"; // must come before the plugin import
import "@geoman-io/leaflet-geoman-free";
import { useEffect, useMemo, useRef } from "react";
import type { Feature, FeatureCollection, GeoJsonObject } from "geojson";
import L, { geoJSON, type Layer, type PathOptions, type WMSParams } from "leaflet";
import { GeoJSON, LayersControl, MapContainer, Pane, ScaleControl, TileLayer, WMSTileLayer, useMap } from "react-leaflet";
import { useGeoJson, wmsUrl } from "@/lib/api";
import type { MapVisual } from "@/lib/chat";
import { interpolate } from "@/lib/colors";
import { fmt } from "@/lib/format";
import { featureCode, useBoundaries } from "./RankingMap";

const RAMPS: Record<string, string[]> = {
  reds: ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"],
  oranges: ["#feedde", "#fdbe85", "#fd8d3c", "#e6550d", "#a63603"],
  blues: ["#eff3ff", "#bdd7e7", "#6baed6", "#3182bd", "#08519c"],
  greens: ["#edf8e9", "#bae4b3", "#74c476", "#31a354", "#006d2c"],
  purples: ["#f2f0f7", "#cbc9e2", "#9e9ac8", "#756bb1", "#54278f"],
  browns: ["#fff7bc", "#fee391", "#fec44f", "#ec7014", "#993404"],
  greys: ["#f7f7f7", "#cccccc", "#969696", "#636363", "#252525"],
};
const NO_DATA = "#cfd8dc";
const CENTER: [number, number] = [25.37, 82.93];

/** Zooms to the focused villages, else an uploaded area, else the whole district, whenever a new visual is shown. */
function Fit({ geo, focus, area, visualKey }: { geo: FeatureCollection | null; focus: string[]; area?: GeoJsonObject | null; visualKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (area && !focus.length) {
      map.flyToBounds(geoJSON(area).getBounds(), { padding: [40, 40], maxZoom: 14, duration: 0.6 });
      return;
    }
    if (!geo?.features.length) return;
    const set = new Set(focus);
    const features = set.size ? geo.features.filter((f) => set.has(featureCode(f))) : geo.features;
    if (!features.length) return;
    map.flyToBounds(geoJSON({ type: "FeatureCollection", features } as FeatureCollection).getBounds(), {
      padding: [40, 40], maxZoom: set.size === 1 ? 14 : 13, duration: 0.6,
    });
  }, [visualKey, geo?.features.length]);
  return null;
}

// Only shapes drawn with the toolbar can be edited / removed, never the village or raster layers.
L.PM.setOptIn(true);

const DRAW_STYLE = { color: "#6a1b9a", weight: 3, fillColor: "#ce93d8", fillOpacity: 0.15 };

/** Circle as a 64-point polygon (GeoJSON has no circles). */
function circleFeature(c: L.Circle): Feature {
  const { lat, lng } = c.getLatLng();
  const r = c.getRadius();
  const ring = Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    return [lng + (r * Math.sin(a)) / (111320 * Math.cos((lat * Math.PI) / 180)), lat + (r * Math.cos(a)) / 110574];
  });
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

/** Leaflet-Geoman toolbar: draw polygons, rectangles, circles, lines or points; reports the drawing as GeoJSON. */
function DrawControl({ onChange, clearKey }: { onChange: (fc: FeatureCollection | null) => void; clearKey: number }) {
  const map = useMap();
  const drawn = useRef(new Set<L.Layer>());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    map.pm.addControls({
      position: "topleft", drawMarker: true, drawCircleMarker: false, drawPolyline: true, drawRectangle: true,
      drawPolygon: true, drawCircle: true, drawText: false, editMode: true, dragMode: true, cutPolygon: false,
      removalMode: true, rotateMode: false,
    });
    map.pm.setGlobalOptions({ pathOptions: DRAW_STYLE, templineStyle: DRAW_STYLE, hintlineStyle: { ...DRAW_STYLE, dashArray: "5,5" } });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const report = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const features = [...drawn.current].map((layer) =>
          layer instanceof L.Circle ? circleFeature(layer) : (layer as L.Polygon).toGeoJSON() as Feature);
        onChangeRef.current(features.length ? { type: "FeatureCollection", features } : null);
      }, 400);
    };
    const onCreate = (e: { layer: L.Layer }) => {
      (e.layer.options as { pmIgnore?: boolean }).pmIgnore = false;
      L.PM.reInitLayer(e.layer);
      drawn.current.add(e.layer);
      e.layer.on("pm:edit pm:dragend", report);
      report();
    };
    const onRemove = (e: { layer: L.Layer }) => {
      drawn.current.delete(e.layer);
      report();
    };
    map.on("pm:create", onCreate);
    map.on("pm:remove", onRemove);
    return () => {
      clearTimeout(timer);
      map.off("pm:create", onCreate);
      map.off("pm:remove", onRemove);
      map.pm.removeControls();
    };
  }, [map]);

  // Clear the drawing when the page asks (area removed in the chat).
  useEffect(() => {
    if (!clearKey) return;
    drawn.current.forEach((layer) => map.removeLayer(layer));
    drawn.current.clear();
  }, [clearKey, map]);
  return null;
}

interface Props {
  visual: MapVisual | null;
  visualKey: string;
  /** Called with the shapes drawn on the map (null when the drawing is cleared). */
  onDraw?: (fc: FeatureCollection | null) => void;
  /** Increment to remove everything drawn. */
  clearDrawKey?: number;
}

export default function AssistantMap({ visual, visualKey, onDraw, clearDrawKey = 0 }: Props) {
  const boundaries = useBoundaries();
  const { data: blockGeo } = useGeoJson("blocks");
  const values = visual?.values ?? {};
  const hasValues = Object.keys(values).length > 0;
  const highlight = useMemo(() => new Set(visual?.highlight ?? []), [visual]);
  const ramp = RAMPS[visual?.metric.ramp ?? "reds"] ?? RAMPS.reds;

  // Villages in the result (the whole district when the visual has no values, e.g. under a raster).
  const geo = useMemo<FeatureCollection | null>(() => {
    if (!boundaries) return null;
    if (!hasValues) return boundaries;
    return { ...boundaries, features: boundaries.features.filter((f) => featureCode(f) in values) };
  }, [boundaries, values, hasValues]);

  const [min, max] = useMemo(() => {
    const v = Object.values(values);
    return v.length ? [Math.min(...v), Math.max(...v)] : [0, 0];
  }, [values]);

  const style = (f?: Feature): PathOptions => {
    const code = f ? featureCode(f) : "";
    const hl = highlight.has(code);
    if (!hasValues) {
      return hl ? { fill: false, color: "#0d47a1", weight: 3.5 } : { fill: false, color: "#455a64", weight: 0.4, opacity: 0.6 };
    }
    const v = values[code];
    const fillColor = v == null ? NO_DATA : max > min ? interpolate(ramp, (v - min) / (max - min)) : ramp[2];
    if (hl) return { fillColor, fillOpacity: 0.95, color: "#0d47a1", weight: 3 };
    return { fillColor, fillOpacity: highlight.size ? 0.45 : 0.78, color: "#455a64", weight: 0.4 };
  };

  const onEach = (f: Feature, layer: Layer) => {
    const code = featureCode(f);
    const name = visual?.names[code] ?? f.properties?.village_name ?? "Village";
    const v = values[code];
    layer.bindTooltip(
      `<b>${name}</b>${f.properties?.block_name ? `<br>${f.properties.block_name}` : ""}` +
        (v != null && visual ? `<br>${visual.metric.label}: <b>${fmt(v, 1)}</b> ${visual.metric.unit}` : ""),
      { sticky: true },
    );
  };

  const raster = visual?.raster;
  const stats = raster?.stats;

  return (
    <div className="map-wrap assistant-map-wrap">
      {/* pmIgnore={false}: with Geoman's opt-in mode the map itself must opt in to get the drawing toolbar. */}
      <MapContainer center={CENTER} zoom={10} preferCanvas className="map assistant-map" pmIgnore={false}>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="OpenStreetMap">
            <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite (Esri)">
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Esri World Imagery" />
          </LayersControl.BaseLayer>
          {blockGeo && (
            <LayersControl.Overlay checked name="Block boundaries">
              <GeoJSON data={blockGeo} interactive={false}
                style={{ fill: false, color: "#d84315", weight: 1.5, dashArray: "3, 4" }} />
            </LayersControl.Overlay>
          )}
        </LayersControl>
        {raster && (
          // With a thematic map as well, the raster goes on top (half transparent, clicks pass through to the
          // villages); alone, it sits under the village outlines.
          <Pane name={hasValues ? "assistant-raster-top" : "assistant-raster"}
            style={hasValues ? { zIndex: 450, pointerEvents: "none" } : { zIndex: 390 }}>
            <WMSTileLayer key={`${raster.layer}|${raster.clip ?? ""}`} url={wmsUrl(raster.workspace)}
              // "clip": GeoServer cuts the raster to the uploaded area.
              params={{ layers: raster.layer, format: "image/png", transparent: true, ...(raster.clip ? { clip: raster.clip } : {}) } as WMSParams}
              opacity={hasValues ? 0.7 : 0.8} />
          </Pane>
        )}
        {geo && <GeoJSON key={visualKey + (boundaries?.features.length ?? 0)} data={geo} style={style} onEachFeature={onEach} />}
        {visual?.area && (
          <GeoJSON key={`area|${visualKey}`} data={visual.area} interactive={false}
            style={{ fill: false, color: "#1a237e", weight: 3, dashArray: "8 6" }} />
        )}
        <Fit geo={boundaries} focus={visual?.focus ?? []} area={visual?.area} visualKey={visualKey} />
        {onDraw && <DrawControl onChange={onDraw} clearKey={clearDrawKey} />}
        <ScaleControl position="bottomleft" imperial={false} />
      </MapContainer>

      {visual && (
        <div className="map-legend assistant-legend">
          <div className="legend-title">{visual.title}</div>
          {hasValues && max > min && (
            <>
              {raster && <div className="legend-sub">{visual.metric.label}</div>}
              <div className="legend-bar" style={{ background: `linear-gradient(to right, ${ramp.join(",")})` }} />
              <div className="legend-range"><span>{fmt(min, 1)}</span><span>{visual.metric.unit}</span><span>{fmt(max, 1)}</span></div>
            </>
          )}
          {raster && (
            <>
              {hasValues && <div className="legend-sub">{raster.title}</div>}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={`${raster.title} legend`}
                src={`${wmsUrl(raster.workspace)}?service=WMS&request=GetLegendGraphic&format=image/png&layer=${encodeURIComponent(raster.layer)}`} />
              {raster.unit && <div className="legend-range"><span>{raster.unit}</span></div>}
              {stats?.covered && (
                <div className="assistant-raster-stats">
                  mean {fmt(stats.mean, 3)} · max {fmt(stats.max, 3)}
                  {stats.total != null && <> · {visual.area ? "total inside area" : "village total"} {fmt(stats.total, 1)} t CO₂e/yr</>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
