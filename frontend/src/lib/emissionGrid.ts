// Emission-raster cells of one village (from GeoServer via /api/geo/emission-grid), rescaled and painted in the browser.
import type { EmissionGrid } from "./types";

/** Emission raster source -> the Carbon Lab sources (left panel) it is built from. */
export const RASTER_GROUPS: Record<string, string[]> = {
  lpg: ["lpg"], firewood: ["firewood"], electricity: ["electricity"], transport: ["petrol"], waste: ["waste"],
  livestock: ["cow", "goat", "sheep"],
};

export type GridEntry = EmissionGrid["legends"][string][number];
export const classOf = (legend: GridEntry[], v: number) => legend.findIndex((l) => v < l.quantity);

/** Village cells of one raster (or "total"), each source scaled by `ratio` (scenario ÷ survey; 1 = survey). */
export function scenarioRaster(grid: EmissionGrid, raster: string, ratio: Record<string, number> = {}) {
  const keys = raster === "total" ? Object.keys(RASTER_GROUPS) : [raster];
  const n = grid.width * grid.height;
  const values = new Float64Array(n);
  for (const k of keys) {
    const cells = grid.sources[k];
    const r = ratio[k] ?? 1;
    if (cells && r) for (let i = 0; i < n; i++) values[i] += cells[i] * r;
  }
  return values;
}

/** PNG data URL of the cells coloured by the legend classes (one pixel per cell, outside the village transparent). */
export function paint(grid: EmissionGrid, values: Float64Array, legend: GridEntry[]): string {
  const canvas = document.createElement("canvas");
  canvas.width = grid.width;
  canvas.height = grid.height;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(grid.width, grid.height);
  values.forEach((v, i) => {
    if (!grid.inside[i] || v <= 0) return;
    const entry = legend[classOf(legend, v)] ?? legend.at(-1)!;
    if (!entry || entry.opacity === 0) return;
    const c = parseInt(entry.color.slice(1), 16);
    img.data.set([(c >> 16) & 255, (c >> 8) & 255, c & 255, 255], i * 4);
  });
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}
