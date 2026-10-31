import useSWR, { mutate } from "swr";
import type { FeatureCollection } from "geojson";
import type {
  CensusVillage, District, EmissionFactor, RasterLayer, State, Submission, SubmissionDetails, Subdistrict, Summary,
  SupervisorVillage, SurveyField, User, Village, VillageDetails,
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
  if (!res.ok) throw new ApiError(await errorMessage(res));
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
