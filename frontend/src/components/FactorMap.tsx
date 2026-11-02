"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import { geoJSON, type LatLng, type WMSParams } from "leaflet";
import { GeoJSON, ImageOverlay, MapContainer, Popup, ScaleControl, TileLayer, WMSTileLayer, useMap, useMapEvents } from "react-leaflet";
import { useGeoJson, useVillageCadastral, wmsUrl } from "@/lib/api";
import { fmt } from "@/lib/format";
import type { RasterFactor } from "@/lib/types";

export interface GridOverlay {
  /** PNG data URL of the scenario raster, one pixel per cell. */
  url: string;
  /** west, south, east, north */
  bounds: [number, number, number, number];
  /** Popup text for a clicked point, or null outside the village. */
  read: (lat: number, lng: number) => string | null;
  title: string;
}

interface Props {
  villageCode: string;
  /** Scenario emission raster computed in the browser from the GeoServer cells. */
  overlay: GridOverlay | null;
  /** A raster served by GeoServer WMS (uploaded layers), clipped to the village; drawn instead of the overlay. */
  factor: RasterFactor | null;
  opacity: number;
  /** Draw the khasra parcel lines. */
  parcels: boolean;
}

const MAX_CLIP_POINTS = 220;
const PARCEL_USE_LABEL: Record<string, string> = {
  builtup: "Built-up", cropland: "Cropland", trees: "Trees", water: "Water", rangeland: "Rangeland", bare: "Bare ground", land: "Land",
};

const ringArea = (r: Position[]) => Math.abs(r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0)) / 2;

/** Outer rings of every sizeable part, thinned so the WMS URL stays short. */
function clipWkt(geom: Geometry): string | null {
  const polys: Position[][][] = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
  const rings = polys.map((p) => p[0]).filter((r) => r.length > 3);
  if (!rings.length) return null;
  const biggest = Math.max(...rings.map(ringArea));
  const kept = rings.filter((r) => ringArea(r) >= biggest * 0.02);
  const total = kept.reduce((s, r) => s + r.length, 0);
  const parts = kept.map((r) => {
    const step = Math.max(1, Math.ceil(total / MAX_CLIP_POINTS));
    const pts = r.filter((_, i) => i % step === 0);
    if (pts.length < 3) return null;
    return `((${[...pts, pts[0]].map(([x, y]) => `${x.toFixed(5)} ${y.toFixed(5)}`).join(",")}))`;
  }).filter(Boolean);
  return parts.length ? `srid=4326;MULTIPOLYGON(${parts.join(",")})` : null;
}

function inRing([x, y]: [number, number], ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function FitTo({ feature }: { feature: Feature | null }) {
  const map = useMap();
  useEffect(() => {
    if (feature) map.fitBounds(geoJSON(feature).getBounds(), { padding: [16, 16] });
  }, [feature, map]);
  return null;
}

interface Probe { at: LatLng; text: string; parcel?: string }

/** Click: GetFeatureInfo for the pixel under the cursor, labelled with its legend class and the khasra there. */
function ValueProbe({ factor, overlay, parcels }: { factor: RasterFactor | null; overlay: GridOverlay | null; parcels: Feature[] }) {
  const [probe, setProbe] = useState<Probe | null>(null);
  useEffect(() => setProbe(null), [factor, overlay?.title]);
  useMapEvents({
    async click(e) {
      const { lat, lng } = e.latlng;
      const hit = parcels.find((f) => f.geometry.type === "Polygon" && inRing([lng, lat], f.geometry.coordinates[0]));
      const parcel = hit
        ? `Khasra ${hit.properties?.khasra ?? "?"} · ${fmt(Number(hit.properties?.area_m2) / 1e4, 2)} ha · ${PARCEL_USE_LABEL[hit.properties?.use] ?? hit.properties?.use}`
        : undefined;
      if (!factor) {
        const text = overlay?.read(lat, lng) ?? "";
        if (parcel || text) setProbe({ at: e.latlng, text, parcel });
        return;
      }
      const d = 0.0005;
      const q = new URLSearchParams({
        SERVICE: "WMS", VERSION: "1.1.1", REQUEST: "GetFeatureInfo", LAYERS: factor.layer, QUERY_LAYERS: factor.layer,
        INFO_FORMAT: "application/json", SRS: "EPSG:4326", BBOX: [lng - d, lat - d, lng + d, lat + d].join(","),
        WIDTH: "101", HEIGHT: "101", X: "50", Y: "50",
      });
      try {
        const res = await fetch(`${wmsUrl(factor.workspace)}?${q}`);
        const props = (await res.json()).features?.[0]?.properties ?? {};
        const value = Object.values(props)[0] as number | undefined;
        const valid = typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 1e30;
        const entry = valid && factor.legend.length
          ? factor.legend_type === "values"
            ? factor.legend.find((l) => Math.abs(l.quantity - value) < 1e-9)
            : factor.legend_type === "intervals"
              ? factor.legend.find((l) => value < l.quantity) ?? factor.legend.at(-1)
              : factor.legend.find((l) => value <= l.quantity) ?? factor.legend.at(-1)
          : undefined;
        const text = !valid ? "No data here"
          : entry?.opacity === 0 ? "No emission from this source here"
          : `${fmt(value, Math.abs(value) < 100 ? 2 : 0)}${factor.unit ? ` ${factor.unit}` : ""}${entry ? ` · ${entry.label}` : ""}`;
        setProbe({ at: e.latlng, text, parcel });
      } catch {
        setProbe({ at: e.latlng, text: "Could not read the raster value", parcel });
      }
    },
  });
  if (!probe) return null;
  return (
    <Popup position={probe.at} eventHandlers={{ remove: () => setProbe(null) }}>
      {probe.text && <><b>{factor?.title ?? overlay?.title}</b><br />{probe.text}</>}
      {probe.parcel && <>{probe.text && <br />}<span className="probe-parcel">{probe.parcel}</span></>}
    </Popup>
  );
}

export default function FactorMap({ villageCode, overlay, factor, opacity, parcels: showParcels }: Props) {
  const clip = true;
  const { data: villageGeo } = useGeoJson("villages");
  const { data: cadastral } = useVillageCadastral(villageCode);
  const census = useMemo(
    () => villageGeo?.features.find((f) => String(f.properties?.village_code ?? "").trim() === villageCode) ?? null,
    [villageGeo, villageCode],
  );
  // Cadastral boundary (dissolved khasra parcels) when the village has parcel data, else the census boundary.
  const cadastralBoundary = useMemo(() => cadastral?.features.find((f) => f.properties?.kind === "boundary") ?? null, [cadastral]);
  const parcels = useMemo(() => cadastral?.features.filter((f) => f.properties?.kind === "parcel") ?? [], [cadastral]);
  const feature = cadastralBoundary ?? census;
  const wkt = useMemo(() => (clip && feature ? clipWkt(feature.geometry) : null), [clip, feature]);
  const params = { layers: factor?.layer ?? "", format: "image/png", transparent: true, ...(wkt ? { clip: wkt } : {}) } as WMSParams;

  return (
    <MapContainer center={[25.32, 82.97]} zoom={11} className="factor-map" zoomControl>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
      {factor ? (
        <WMSTileLayer key={`${factor.layer}|${wkt ?? ""}`} url={wmsUrl(factor.workspace)} params={params} opacity={opacity} />
      ) : overlay && (
        <ImageOverlay url={overlay.url} className="emission-overlay" opacity={opacity}
          bounds={[[overlay.bounds[1], overlay.bounds[0]], [overlay.bounds[3], overlay.bounds[2]]]} />
      )}
      {showParcels && parcels.length > 0 && (
        <GeoJSON key={`parcels-${villageCode}`} data={{ type: "FeatureCollection", features: parcels } as FeatureCollection} interactive={false}
          style={{ color: "#4a148c", weight: 0.6, opacity: 0.55, fill: false }} />
      )}
      {feature && (
        <GeoJSON key={`${villageCode}-${cadastralBoundary ? "cadastral" : "census"}`} data={feature} interactive={false}
          style={{ color: "#1b5e20", weight: 2.5, fill: !clip, fillOpacity: 0.04, dashArray: clip ? undefined : "5 4" }} />
      )}
      <FitTo feature={feature} />
      <ValueProbe factor={factor} overlay={overlay} parcels={parcels} />
      <ScaleControl position="bottomleft" imperial={false} />
    </MapContainer>
  );
}
