import useSWR, { mutate } from "swr";
import type { FeatureCollection } from "geojson";
import type {
  CensusVillage, CensusVillageDetails, District, EmissionFactor, RasterFactor, RasterLayer, State, Submission, SubmissionDetails, Subdistrict, Summary,
  SupervisorVillage, SurveyField, User, Village, VillageDetails, VillageFactorStats, VillageScene, VillageElevation, EmissionGrid, BlogPost, BlogPostDetails,
} from "./types";

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

// Login token, kept in sync by AuthProvider; sent as a Bearer header by authFetch.
let authToken: string | null = null;
export const setAuthToken = (token: string | null) => { authToken = token; };

export function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
  return fetch(url, { ...init, headers });
}

export async function authFetcher<T>(url: string): Promise<T> {
  const res = await authFetch(url);
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  return res.json();
}

/** Sends JSON (or FormData) with the login token; returns the parsed response (null when empty). */
export async function sendApi<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await authFetch(url, {
    method,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    headers: body === undefined || isForm ? undefined : { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  return res.status === 204 ? (null as T) : res.json();
}

/** Downloads a file from an endpoint that needs the login token. */
export async function downloadFile(url: string, filename: string) {
  const res = await authFetch(url);
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  const href = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href, download: filename });
  a.click();
  URL.revokeObjectURL(href);
}

/** Object URL for a file from an endpoint that needs the login token (revoke it when done). */
export async function fileObjectUrl(url: string): Promise<{ url: string; type: string }> {
  const res = await authFetch(url);
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), type: blob.type };
}

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  return res.json();
}

export async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (Array.isArray(body.detail)) {
      // FastAPI validation errors: "field: message"
      return body.detail.map((d: { loc?: string[]; msg: string }) => `${d.loc?.at(-1) ?? ""}: ${d.msg}`).join("; ");
    }
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
/** Cadastral layout for the Carbon Lab 3D view (404 when the village has no parcel data). */
export const useVillageScene = (code: string | null) =>
  useSWR<VillageScene>(code ? `/api/villages/${code}/scene` : null, fetcher, { revalidateOnFocus: false, shouldRetryOnError: false });

/** Digital Elevation Model (DEM) profile and house elevations for one village. */
export const useVillageElevation = (code: string | null) =>
  useSWR<VillageElevation>(code ? `/api/villages/${code}/elevation` : null, fetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
/** Boundary layers served by GeoServer WFS (workspace varanasi) as WGS84 GeoJSON. */
const GEO_LAYERS = {
  district: { typeName: "district_boundary" },
  blocks: { typeName: "block_boundaries" },
  // Census village boundaries, with the names from the village table.
  villages: { typeName: "villages_carbon", properties: "village_code,village_name,block_name,subdistrict,geom" },
  // Village boundaries dissolved from the khasra parcels.
  villages_cadastral: { typeName: "villages_cadastral" },
} as const;

export const geoJsonUrl = (layer: keyof typeof GEO_LAYERS) => {
  const spec: { typeName: string; properties?: string } = GEO_LAYERS[layer];
  const q = new URLSearchParams({
    // WFS 1.0.0 keeps lon/lat axis order for EPSG:4326.
    service: "WFS", version: "1.0.0", request: "GetFeature", typeName: `varanasi:${spec.typeName}`,
    outputFormat: "application/json", srsName: "EPSG:4326",
  });
  if (spec.properties) q.set("propertyName", spec.properties);
  return `/geoserver/varanasi/ows?${q}`;
};

export const useGeoJson = (layer: keyof typeof GEO_LAYERS) =>
  useSWR<FeatureCollection>(geoJsonUrl(layer), fetcher, { revalidateOnFocus: false });

export const useRasterLayers = () =>
  useSWR<RasterLayer[]>("/api/geo/rasters", fetcher, { revalidateOnFocus: false });

/** Khasra parcels (with LULC use) and the boundary dissolved from them, WGS84 (404 without parcel data). */
export const useVillageCadastral = (code: string | null) =>
  useSWR<FeatureCollection>(code ? `/api/villages/${code}/cadastral` : null, fetcher, { revalidateOnFocus: false, shouldRetryOnError: false });

/** The village's cells of each source emission raster, for rescaling to the Carbon Lab scenario. */
export const useEmissionGrid = (village: string | null) =>
  useSWR<EmissionGrid>(village ? `/api/geo/emission-grid?village=${village}` : null, fetcher, { revalidateOnFocus: false, shouldRetryOnError: false });

/** Published blog posts (newest first); admins use the manage list, which includes drafts. */
export const useBlogPosts = (limit?: number) => useSWR<BlogPost[]>(`/api/blog${limit ? `?limit=${limit}` : ""}`, fetcher);
export const useManagedPosts = (enabled: boolean) => useSWR<BlogPost[]>(enabled ? "/api/blog/manage" : null, authFetcher);
export const useBlogPost = (slug: string | null, asAdmin = false) =>
  useSWR<BlogPostDetails>(slug ? (asAdmin ? `/api/blog/manage/${slug}` : `/api/blog/${slug}`) : null, asAdmin ? authFetcher : fetcher, {
    shouldRetryOnError: false,
  });
export const blogCoverUrl = (p: Pick<BlogPost, "slug" | "has_cover" | "modified_at">) =>
  p.has_cover ? `/api/blog/${p.slug}/cover?v=${encodeURIComponent(p.modified_at)}` : null;

/** Raster factors listed from GeoServer (curated + added from the dashboard). */
export const useRasterFactors = () => useSWR<RasterFactor[]>("/api/geo/factors", fetcher, { revalidateOnFocus: false });
export const useFactorStats = (layer: string | null, village: string | null) =>
  useSWR<VillageFactorStats>(layer && village ? `/api/geo/factors/stats?layer=${encodeURIComponent(layer)}&village=${village}` : null, fetcher, {
    revalidateOnFocus: false,
  });

/** GeoServer WMS endpoint & legend image, proxied through the Next.js server. */
export const wmsUrl = (workspace: string) => `/geoserver/${workspace}/wms`;
export const wmsLegendUrl = (r: RasterLayer) =>
  `${wmsUrl(r.workspace)}?service=WMS&request=GetLegendGraphic&format=image/png&layer=${encodeURIComponent(r.layer)}`;

/** Re-fetch every cached API response (after data changes on the server). */
export const refreshAll = () => mutate(() => true);

export const reportPdfUrl = (code: string) => `/api/villages/${code}/report.pdf`;
/** Needs the login token: download with downloadFile(). */
export const advancedReportUrl = (code: string) => `/api/villages/${code}/report-advanced.pdf`;
export const villageCsvUrl = (code: string) => `/api/villages/${code}/export.csv`;

// ---------- Census locations (public) ----------
export const useSurveyFields = () =>
  useSWR<SurveyField[]>("/api/survey-fields", fetcher, { revalidateOnFocus: false });
export const useStates = () => useSWR<State[]>("/api/locations/states", fetcher, { revalidateOnFocus: false });
export const useDistricts = (state: number | null) =>
  useSWR<District[]>(state ? `/api/locations/districts?state_code=${state}` : null, fetcher, { revalidateOnFocus: false });
export const useSubdistricts = (district: number | null) =>
  useSWR<Subdistrict[]>(district ? `/api/locations/subdistricts?district_code=${district}` : null, fetcher,
    { revalidateOnFocus: false });
export const useCensusVillages = (subdistrict: number | null) =>
  useSWR<CensusVillage[]>(subdistrict ? `/api/locations/villages?subdistrict_code=${subdistrict}` : null, fetcher,
    { revalidateOnFocus: false });
/** Census villages of one district (every sub-district). */
export const useDistrictCensusVillages = (district: number | null) =>
  useSWR<CensusVillage[]>(district ? `/api/locations/villages?district_code=${district}` : null, fetcher,
    { revalidateOnFocus: false });
/** One census village with its State > District > Sub-district codes (404 for villages not in the census list). */
export const fetchCensusVillage = (code: string) => fetcher<CensusVillageDetails>(`/api/locations/villages/${code}`);

// ---------- Logged-in APIs (pass enabled=false until the user is known) ----------
const useAuthed = <T,>(url: string | null) => useSWR<T>(url, authFetcher);
export const useSupervisorVillage = (enabled: boolean) =>
  useAuthed<SupervisorVillage>(enabled ? "/api/supervisor/village" : null);
export const useMySubmissions = (enabled: boolean) => useAuthed<Submission[]>(enabled ? "/api/supervisor/submissions" : null);
export const useUsers = (enabled: boolean) => useAuthed<User[]>(enabled ? "/api/admin/users" : null);
export const useVerifications = (enabled: boolean, status: string) =>
  useAuthed<User[]>(enabled ? `/api/admin/verifications?status=${status}` : null);
export const useSubmissions = (enabled: boolean, status: string) =>
  useAuthed<Submission[]>(enabled ? `/api/admin/submissions${status ? `?status=${status}` : ""}` : null);
export const useSubmission = (id: number | null) =>
  useAuthed<SubmissionDetails>(id ? `/api/admin/submissions/${id}` : null);
