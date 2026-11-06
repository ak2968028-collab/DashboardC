"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import type { Feature, FeatureCollection } from "geojson";
import { geoJSON, type Layer, type PathOptions } from "leaflet";
import { GeoJSON, MapContainer, ScaleControl, TileLayer, useMap } from "react-leaflet";
import { featureCode, useBoundaries } from "./RankingMap";

export interface MapClass { key: string; label: string; color: string }

interface Props {
  /** Class key and tooltip HTML per village code (villages outside the filter are left out). */
  classes: Map<string, { cls: string; tooltip: string }>;
  legend: MapClass[];
  onSelect: (code: string) => void;
  /** Village outlined as picked. */
  picked?: string | null;
  /** When set, only these villages keep their colour; the rest are greyed out. */
  focus?: Set<string> | null;
  /** Changes whenever classes or focus change, so the layer is restyled. */
  styleKey: string;
}

function FitPool({ geo }: { geo: FeatureCollection | null }) {
  const map = useMap();
  const n = geo?.features.length;
  useEffect(() => {
    if (geo?.features.length) map.fitBounds(geoJSON(geo).getBounds(), { padding: [10, 10] });
  }, [n]);
  return null;
}

/** District overview map: each village coloured by a category (dominant source, emission level…). */
export default function HomeMap({ classes, legend, onSelect, picked, focus, styleKey }: Props) {
  const boundaries = useBoundaries();
  const pool = useMemo<FeatureCollection | null>(() => boundaries && {
    ...boundaries, features: boundaries.features.filter((f) => classes.has(featureCode(f))),
  }, [boundaries, classes]);
  const colorOf = useMemo(() => new Map(legend.map((l) => [l.key, l.color])), [legend]);

  const style = (f?: Feature): PathOptions => {
    const code = f ? featureCode(f) : "";
    const isPicked = !!f && code === picked;
    const dimmed = !!focus && !focus.has(code) && !isPicked;
    return {
      fillColor: dimmed ? "#cfd6de" : (f && colorOf.get(classes.get(code)?.cls ?? "")) || "#e0e0e0",
      fillOpacity: isPicked ? 1 : dimmed ? 0.35 : 0.85, color: isPicked ? "#0d47a1" : "#ffffff", weight: isPicked ? 3 : 0.6,
    };
  };
  const onEach = (f: Feature, layer: Layer) => {
    const c = classes.get(featureCode(f));
    if (c) layer.bindTooltip(c.tooltip, { sticky: true });
    layer.on("click", () => onSelect(featureCode(f)));
  };

  return (
    <div className="home-map-wrap">
      <MapContainer center={[25.37, 82.93]} zoom={10} preferCanvas className="home-map">
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
        {pool && <GeoJSON key={`${styleKey}|${picked}`} data={pool} style={style} onEachFeature={onEach} />}
        <FitPool geo={pool} />
        <ScaleControl position="bottomleft" imperial={false} />
      </MapContainer>
      {!pool && <div className="loading home-map-loading">Loading village boundaries…</div>}
    </div>
  );
}
