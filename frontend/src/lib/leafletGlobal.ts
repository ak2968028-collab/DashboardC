// Leaflet plugins written for <script> tags (leaflet-geoman) look for a global `L`; the bundler imports Leaflet as a
// module, so expose it before such a plugin is imported.
import L from "leaflet";

if (typeof window !== "undefined") (window as unknown as { L: typeof L }).L = L;

export default L;
