import type { NextConfig } from "next";
import tunnel from "./tunnel.json";

// Where the Next.js server proxies /api/* (FastAPI backend) and /geoserver/* (GeoServer WMS) requests.
// Env vars win; otherwise the Cloudflare tunnel URL kept in tunnel.json by ../update-tunnel-url.sh.
const API_URL = process.env.API_URL || tunnel.API_URL || "http://localhost:8000";
const GEOSERVER_URL = process.env.GEOSERVER_URL || tunnel.GEOSERVER_URL || "http://localhost:8080";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_URL}/api/:path*` },
      { source: "/geoserver/:path*", destination: `${GEOSERVER_URL}/geoserver/:path*` },
    ];
  },
};

export default nextConfig;
