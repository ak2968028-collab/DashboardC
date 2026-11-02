"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import type { Feature, Geometry, Position } from "geojson";
import { geoJSON, type LatLng, type WMSParams } from "leaflet";
import { GeoJSON, MapContainer, Popup, ScaleControl, TileLayer, WMSTileLayer, useMap, useMapEvents } from "react-leaflet";
import { useGeoJson, wmsUrl } from "@/lib/api";
import { fmt } from "@/lib/format";
import type { RasterFactor } from "@/lib/types";

interface Props {
  villageCode: string;
  factor: RasterFactor | null;
  opacity: number;
  /** Cut the raster to the village boundary (GeoServer WMS `clip`). */
  clip: boolean;
}

const MAX_CLIP_POINTS = 120;

/** Outer ring of the largest polygon, thinned so the WMS URL stays short. */
function clipWkt(geom: Geometry): string | null {
  const polys: Position[][][] = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
  if (!polys.length) return null;
  const area = (r: Position[]) => Math.abs(r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0));
  const ring = polys.map((p) => p[0]).sort((a, b) => area(b) - area(a))[0];
  const step = Math.ceil(ring.length / MAX_CLIP_POINTS);
  const pts = ring.filter((_, i) => i % step === 0);
  pts.push(pts[0]);
  return `srid=4326;POLYGON((${pts.map(([x, y]) => `${x.toFixed(5)} ${y.toFixed(5)}`).join(",")}))`;
}

function FitTo({ feature }: { feature: Feature | null }) {
  const map = useMap();
  useEffect(() => {
    if (feature) map.fitBounds(geoJSON(feature).getBounds(), { padding: [16, 16] });
  }, [feature, map]);
  return null;
}

interface Probe { at: LatLng; text: string }

/** Click: GetFeatureInfo for the pixel under the cursor, labelled with its legend class. */
function ValueProbe({ factor }: { factor: RasterFactor | null }) {
  const [probe, setProbe] = useState<Probe | null>(null);
  useEffect(() => setProbe(null), [factor]);
  useMapEvents({
    async click(e) {
      if (!factor) return;
      const d = 0.0005;
      const { lat, lng } = e.latlng;
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
        setProbe({ at: e.latlng, text });
      } catch {
        setProbe({ at: e.latlng, text: "Could not read the raster value" });
      }
    },
  });
  return probe ? <Popup position={probe.at} eventHandlers={{ remove: () => setProbe(null) }}><b>{factor?.title}</b><br />{probe.text}</Popup> : null;
}

export default function FactorMap({ villageCode, factor, opacity, clip }: Props) {
  const { data: villageGeo } = useGeoJson("villages");
  const feature = useMemo(
    () => villageGeo?.features.find((f) => String(f.properties?.village_code ?? "").trim() === villageCode) ?? null,
    [villageGeo, villageCode],
  );
  const wkt = useMemo(() => (clip && feature ? clipWkt(feature.geometry) : null), [clip, feature]);
  const params = { layers: factor?.layer ?? "", format: "image/png", transparent: true, ...(wkt ? { clip: wkt } : {}) } as WMSParams;

  return (
    <MapContainer center={[25.32, 82.97]} zoom={11} className="factor-map" zoomControl>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
      {factor && (
        <WMSTileLayer key={`${factor.layer}|${wkt ?? ""}`} url={wmsUrl(factor.workspace)} params={params} opacity={opacity} />
      )}
      {feature && (
        <GeoJSON key={villageCode} data={feature} interactive={false}
          style={{ color: "#1b5e20", weight: 2.5, fill: !clip, fillOpacity: 0.04, dashArray: clip ? undefined : "5 4" }} />
      )}
      <FitTo feature={feature} />
      <ValueProbe factor={factor} />
      <ScaleControl position="bottomleft" imperial={false} />
    </MapContainer>
  );
}
