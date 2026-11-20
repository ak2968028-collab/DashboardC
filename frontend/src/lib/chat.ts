// Client for the AI assistant (POST /api/chat), which streams NDJSON events from the backend agent.
import useSWR from "swr";
import type { Feature } from "geojson";
import { ApiError, errorMessage, fetcher } from "./api";

export interface MapVisual {
  kind: "map";
  title: string;
  metric: { key: string; label: string; unit: string; ramp: string };
  /** Value per village code (empty: draw outlines only, e.g. under a raster). */
  values: Record<string, number>;
  names: Record<string, string>;
  highlight: string[];
  /** Villages to zoom to (empty: whole district). */
  focus: string[];
  raster: null | {
    name: string; layer: string; workspace: string; title: string; unit: string | null;
    /** WKT the raster is clipped to (GeoServer WMS "clip"), e.g. an uploaded area. */
    clip?: string;
    stats?: { min: number | null; max: number | null; mean: number | null; total: number | null; covered: boolean;
      classes: { label: string; color: string; share_pct: number }[] };
  };
  /** Outline of an uploaded vector area, drawn on top. */
  area?: Feature | null;
}

/** A vector file uploaded for the assistant to clip data and rasters to. */
export interface AreaInfo {
  id: string;
  name: string;
  features: number;
  geometry_types: string[];
  buffered_m: number | null;
  area_ha: number;
  inside_district_pct: number;
  outline: Feature;
}

export const AREA_FILE_TYPES = ".geojson,.json,.kml,.kmz,.zip,.gpkg,.gml";

export async function uploadArea(file: File): Promise<AreaInfo> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/chat/area", { method: "POST", body });
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  return res.json();
}

export interface ChartVisual {
  kind: "chart";
  chart: "bar" | "donut";
  title: string;
  category?: string;
  horizontal?: boolean;
  series?: { key: string; name: string }[];
  data: Record<string, string | number>[];
}

export interface TableVisual {
  kind: "table";
  title: string;
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, string | number | null>[];
}

/** An image or video file the assistant generated (saved in media/temp on the server). */
export interface MediaVisual {
  kind: "media";
  media: "image" | "video";
  title: string;
  url: string;
  gif?: string | null;
  mp4?: string | null;
}

export type Visual = MapVisual | ChartVisual | TableVisual | MediaVisual;

export type ChatEvent =
  | { type: "status"; text: string }
  | { type: "tool"; name: string; args: Record<string, unknown> }
  | { type: "visual"; visual: Visual }
  | { type: "sources"; sources: { title: string; source: string }[] }
  | { type: "token"; text: string }
  | { type: "reset" }
  | { type: "error"; text: string }
  | { type: "ping" }
  | { type: "done" };

export interface ChatTurn { role: "user" | "assistant"; content: string }

export interface ModelStatus {
  online: boolean;
  model: string;
  model_available?: boolean;
  url: string;
  detail?: string;
}

export const useModelStatus = () =>
  useSWR<ModelStatus>("/api/chat/status", fetcher, { refreshInterval: 30000, revalidateOnFocus: false });

/** Sends a question and calls onEvent for every streamed event until the answer is complete. */
export async function askAssistant(message: string, history: ChatTurn[], areaId: string | null, onEvent: (e: ChatEvent) => void, signal?: AbortSignal) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, area_id: areaId }),
    signal,
  });
  if (!res.ok || !res.body) throw new ApiError(await errorMessage(res), res.status);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as ChatEvent);
    }
    if (done) break;
  }
}
