import useSWR, { mutate } from "swr";
import type { FeatureCollection } from "geojson";
import type { EmissionFactor, RasterLayer, Summary, Village, VillageDetails } from "./types";

export class ApiError extends Error {}

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new ApiError(await errorMessage(res));
  return res.json();
}

export async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

export const useVillages = () => useSWR<Village[]>("/api/villages", fetcher);
export const useBlocks = () => useSWR<string[]>("/api/blocks", fetcher);
export const useSummary = () => useSWR<Summary>("/api/summary", fetcher);
export const useEmissionFactors = () => useSWR<EmissionFactor[]>("/api/emission-factors", fetcher);
export const useVillage = (code: string | null) =>
  useSWR<VillageDetails>(code ? `/api/villages/${code}` : null, fetcher);
export const useGeoJson = (layer: "district" | "blocks" | "villages") =>
  useSWR<FeatureCollection>(`/api/geo/${layer}`, fetcher, { revalidateOnFocus: false });

export const useRasterLayers = () =>
  useSWR<RasterLayer[]>("/api/geo/rasters", fetcher, { revalidateOnFocus: false });

/** GeoServer WMS endpoint & legend image, proxied through the Next.js server. */
export const wmsUrl = (workspace: string) => `/geoserver/${workspace}/wms`;
export const wmsLegendUrl = (r: RasterLayer) =>
  `${wmsUrl(r.workspace)}?service=WMS&request=GetLegendGraphic&format=image/png&layer=${encodeURIComponent(r.layer)}`;

/** Re-fetch every cached API response (after data changes on the server). */
export const refreshAll = () => mutate(() => true);

export const reportPdfUrl = (code: string) => `/api/villages/${code}/report.pdf`;
export const villageCsvUrl = (code: string) => `/api/villages/${code}/export.csv`;
