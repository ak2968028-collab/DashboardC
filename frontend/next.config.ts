import type { NextConfig } from "next";

// Where the Next.js server proxies /api/* (FastAPI backend) and /geoserver/* (GeoServer WMS) requests.
const API_URL = process.env.API_URL || "http://localhost:8000";
const GEOSERVER_URL = process.env.GEOSERVER_URL || "http://localhost:8080";

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
