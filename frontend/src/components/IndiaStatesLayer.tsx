"use client";

import { useState } from "react";
import { divIcon } from "leaflet";
import useSWR from "swr";
import { Marker, Pane, WMSTileLayer, useMapEvents } from "react-leaflet";
import { fetcher, wmsUrl } from "@/lib/api";

interface StateLabel { name: string; lon: number; lat: number }

// State names show from country to state zoom, and hide once zoomed in to districts / villages.
const LABEL_MIN_ZOOM = 4;
const LABEL_MAX_ZOOM = 8;

/** Official India state boundaries (media/basemap/State.shp on GeoServer), always drawn over the base map on every
 *  dashboard map: lines as WMS tiles above the base tiles and under the data layers; names as crisp labels (labels on
 *  WMS tiles repeat or get cut at tile edges). Never catches clicks. */
export default function IndiaStatesLayer() {
  const [zoom, setZoom] = useState<number | null>(null);
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const z = zoom ?? map.getZoom();
  const { data: labels = [] } = useSWR<StateLabel[]>("/api/geo/india-states/labels", fetcher, { revalidateOnFocus: false });
  const showLabels = z >= LABEL_MIN_ZOOM && z <= LABEL_MAX_ZOOM;

  return (
    <>
      <Pane name="india-states" style={{ zIndex: 250, pointerEvents: "none" }}>
        <WMSTileLayer url={wmsUrl("varanasi")} params={{ layers: "varanasi:india_states", format: "image/png", transparent: true }} />
      </Pane>
      {showLabels && (
        <Pane name="india-state-labels" style={{ zIndex: 450, pointerEvents: "none" }}>
          {labels.map((l) => (
            <Marker key={l.name} position={[l.lat, l.lon]} interactive={false} keyboard={false}
              icon={divIcon({ className: "india-state-label", html: `<span>${l.name}</span>`, iconSize: [0, 0] })} />
          ))}
        </Pane>
      )}
    </>
  );
}
