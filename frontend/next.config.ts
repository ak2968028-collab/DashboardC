import type { NextConfig } from "next";
import tunnel from "./tunnel.json";

// Where the Next.js server proxies /geoserver/* (GeoServer WMS/WFS) requests.
// /api/* is handled by src/app/api/[...path]/route.ts so it can enforce website-only access and inject X-Website-Key.
const GEOSERVER_URL = process.env.GEOSERVER_URL || tunnel.GEOSERVER_URL || "http://localhost:8080";

const nextConfig: NextConfig = {
  output: "standalone",
  // The AI assistant streams answers from a local LLM; allow slow responses through the /api proxy.
  experimental: { proxyTimeout: 300_000 },
  // The six sector pages were merged into /sectors (one tab each); keep old links and bookmarks working.
  async redirects() {
    return ["demography", "land-water", "energy", "transport", "waste", "livestock"].map((s) => ({
      source: `/${s}`, destination: `/sectors?s=${s}`, permanent: true,
    }));
  },
  async rewrites() {
    return [
      { source: "/geoserver/:path*", destination: `${GEOSERVER_URL}/geoserver/:path*` },
    ];
  },
};

export default nextConfig;
