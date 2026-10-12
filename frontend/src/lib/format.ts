/** Formats a number with thousands separators and fixed decimals (null -> 0). */
export function fmt(value: number | null | undefined, decimals = 0): string {
  return (value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export const num = (value: number | null | undefined) => value ?? 0;

export const mean = (values: (number | null)[]) =>
  values.length ? values.reduce<number>((s, v) => s + (v ?? 0), 0) / values.length : 0;
