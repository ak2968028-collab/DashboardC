"use client";

import { Pane, WMSTileLayer } from "react-leaflet";
import { wmsUrl } from "@/lib/api";

/** India state boundaries, loaded from GeoServer (layer varanasi:india_states, uploaded from media/basemap by
 *  script/geoserver_publish.py) and always drawn over the base map on every dashboard map: above the base tiles,
 *  under the data layers, and never catching clicks. */
export default function IndiaStatesLayer() {
  return (
    <Pane name="india-states" style={{ zIndex: 250, pointerEvents: "none" }}>
      <WMSTileLayer url={wmsUrl("varanasi")} params={{ layers: "varanasi:india_states", format: "image/png", transparent: true }} />
    </Pane>
  );
}
