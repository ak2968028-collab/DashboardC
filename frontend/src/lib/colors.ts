// Continuous colour scales (linear interpolation between stops).

export const SCALES = {
  greens: ["#c7e9c0", "#74c476", "#31a354", "#006d2c", "#00441b"],
  reds: ["#fcbba1", "#fb6a4a", "#ef3b2c", "#cb181d", "#67000d"],
  viridis: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Colour at position t (0..1) along the given stops. */
export function interpolate(stops: string[], t: number): string {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const pos = clamped * (stops.length - 1);
  const i = Math.min(Math.floor(pos), stops.length - 2);
  const f = pos - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  const rgb = a.map((c, k) => Math.round(c + (b[k] - c) * f));
  return `rgb(${rgb.join(",")})`;
}

/** Maps each value to a colour scaled between the min and max of the set. */
export function scaleColors(values: number[], stops: string[]): string[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values.map((v) => interpolate(stops, max > min ? (v - min) / (max - min) : 1));
}
