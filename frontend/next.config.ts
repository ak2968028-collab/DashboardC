import type { NextConfig } from "next";
import tunnel from "./tunnel.json";

// Where the Next.js server proxies /api/* (FastAPI backend) and /geoserver/* (GeoServer WMS) requests.
// Env vars win; otherwise the fixed Cloudflare named-tunnel hostname in tunnel.json.
const API_URL = process.env.API_URL || tunnel.API_URL || "http://localhost:8000";
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
      { source: "/api/:path*", destination: `${API_URL}/api/:path*` },
      { source: "/geoserver/:path*", destination: `${GEOSERVER_URL}/geoserver/:path*` },
    ];
  },
};

export default nextConfig;
