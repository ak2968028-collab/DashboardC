"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import type { Feature, FeatureCollection } from "geojson";
import { geoJSON, type Layer, type PathOptions } from "leaflet";
import { GeoJSON, MapContainer, ScaleControl, TileLayer, useMap } from "react-leaflet";
import { useGeoJson } from "@/lib/api";
import { fmt } from "@/lib/format";

export interface RankBand { from: number; to: number; color: string; label: string }

interface Props {
  /** Rank, value and name per village code (only villages in the current pool). */
  ranks: Map<string, { rank: number; value: number; name: string; block: string }>;
  bands: RankBand[];
  metricLabel: string;
  decimals: number;
  selectedCode: string | null;
  onSelect: (code: string) => void;
  /** Changes whenever the ranking changes, so every polygon is restyled. */
  styleKey: string;
}

const NO_DATA = "#cfd8dc";
const featureCode = (f: Feature) => String(f.properties?.village_code ?? "").trim();

export const bandOf = (bands: RankBand[], rank: number) => bands.find((b) => rank >= b.from && rank <= b.to);

/** Village boundaries: dissolved khasra parcels where available, census boundaries for the rest. */
function useBoundaries(): FeatureCollection | null {
  const { data: census } = useGeoJson("villages");
  const { data: cadastral } = useGeoJson("villages_cadastral");
  return useMemo(() => {
    if (!census) return null;
    const own = new Map((cadastral?.features ?? []).map((f) => [featureCode(f), f]));
    return {
      type: "FeatureCollection",
      features: census.features.map((f) => own.get(featureCode(f)) ?? f),
    };
  }, [census, cadastral]);
}

/** Shows the whole pool on load and when the pool changes; flies to a village only once the viewer picks one. */
function Fit({ geo, selected }: { geo: FeatureCollection | null; selected: Feature | null }) {
  const map = useMap();
  const poolKey = geo?.features.length;
  const code = selected ? featureCode(selected) : null;
  // Village selected when the page opened (by code: the cadastral shape replaces the census one once it loads).
  const firstCode = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (geo?.features.length) map.fitBounds(geoJSON(geo).getBounds(), { padding: [12, 12] });
  }, [poolKey]);
  useEffect(() => {
    if (!code || !selected) return;
    if (firstCode.current === undefined) {
      firstCode.current = code;
      return;
    }
    if (code !== firstCode.current) {
      firstCode.current = null;
      map.flyToBounds(geoJSON(selected).getBounds(), { padding: [80, 80], maxZoom: 14, duration: 0.6 });
    }
  }, [code]);
  return null;
}

export default function RankingMap({ ranks, bands, metricLabel, decimals, selectedCode, onSelect, styleKey }: Props) {
  const boundaries = useBoundaries();
  // Only the villages being ranked (block filter), so the map and the table cover the same pool.
  const pool = useMemo<FeatureCollection | null>(() => boundaries && {
    ...boundaries, features: boundaries.features.filter((f) => ranks.has(featureCode(f))),
  }, [boundaries, ranks]);
  const selected = useMemo(() => pool?.features.find((f) => featureCode(f) === selectedCode) ?? null, [pool, selectedCode]);

  const style = (f?: Feature): PathOptions => {
    const r = f ? ranks.get(featureCode(f)) : undefined;
    const fillColor = r ? bandOf(bands, r.rank)?.color ?? NO_DATA : NO_DATA;
    const isSel = f && featureCode(f) === selectedCode;
    return isSel
      ? { fillColor, fillOpacity: 0.95, color: "#0d47a1", weight: 3.5 }
      : { fillColor, fillOpacity: 0.82, color: "#455a64", weight: 0.5 };
  };

  const onEach = (f: Feature, layer: Layer) => {
    const r = ranks.get(featureCode(f));
    const boundary = f.properties?.source === "cadastral" ? "cadastral" : "census";
    layer.bindTooltip(
      r ? `<b>#${r.rank} ${r.name}</b><br>${r.block}<br>${metricLabel}: <b>${fmt(r.value, decimals)}</b><br><small>${boundary} boundary</small>`
        : `${f.properties?.village_name ?? "Village"}<br>No data`,
      { sticky: true },
    );
    layer.on("click", () => onSelect(featureCode(f)));
  };

  return (
    <div className="map-wrap rank-map-wrap">
      <MapContainer center={[25.37, 82.93]} zoom={10} preferCanvas className="map rank-map">
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
        {pool && (
          <GeoJSON key={`${styleKey}|${selectedCode}`}
            data={pool} style={style} onEachFeature={onEach} />
        )}
        <Fit geo={pool} selected={selected} />
        <ScaleControl position="bottomleft" imperial={false} />
      </MapContainer>
      <div className="rank-legend" aria-label="Rank legend">
        <b>Rank</b>
        {bands.map((b) => (
          <span key={b.label}><i style={{ background: b.color }} />{b.label}</span>
        ))}
        <span><i style={{ background: NO_DATA }} />No data</span>
      </div>
    </div>
  );
}
