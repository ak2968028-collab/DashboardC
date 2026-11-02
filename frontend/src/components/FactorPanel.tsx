"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { Layers, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { mutate } from "swr";
import { errorText, refreshAll, sendApi, useEmissionGrid, useFactorStats, useRasterFactors, useVillageCadastral, wmsUrl } from "@/lib/api";
import { fmt } from "@/lib/format";
import type { EmissionGrid, RasterFactor, VillageFactorStats } from "@/lib/types";
import { useAuth } from "./AuthContext";

// Leaflet needs the browser window, so the map is client-only.
const FactorMap = dynamic(() => import("./FactorMap"), { ssr: false, loading: () => <div className="factor-map loading">Loading map…</div> });
type GridOverlay = import("./FactorMap").GridOverlay;

const RAMPS: Record<string, string[]> = {
  viridis: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
  greens: ["#f7fcf5", "#c7e9c0", "#74c476", "#238b45", "#00441b"],
  reds: ["#fff5f0", "#fcbba1", "#fb6a4a", "#cb181d", "#67000d"],
  blues: ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"],
  spectral: ["#2b83ba", "#abdda4", "#ffffbf", "#fdae61", "#d7191c"],
};

const num = (v: number | null | undefined, unit?: string | null) =>
  v == null ? "–" : `${fmt(v, Math.abs(v) < 100 ? 2 : 0)}${unit ? ` ${unit}` : ""}`;

/** Emission raster source -> the Carbon Lab sources (left panel) it is built from. */
const RASTER_GROUPS: Record<string, string[]> = {
  lpg: ["lpg"], firewood: ["firewood"], electricity: ["electricity"], transport: ["petrol"], waste: ["waste"],
  livestock: ["cow", "goat", "sheep"],
};
const RASTER_OF: Record<string, string> = Object.fromEntries(
  Object.entries(RASTER_GROUPS).flatMap(([raster, keys]) => keys.map((k) => [k, raster])),
);

/** Legend entries that are drawn (transparent "no emission" classes are hidden). */
export const shownLegend = (f: RasterFactor) => f.legend.filter((l) => l.opacity > 0);

type Entry = EmissionGrid["legends"][string][number];
const classOf = (legend: Entry[], v: number) => legend.findIndex((l) => v < l.quantity);

/** Scenario raster for the village: each source's survey cells scaled by (scenario ÷ survey) emissions for that source. */
function scenarioRaster(grid: EmissionGrid, raster: string, ratio: Record<string, number>) {
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

function paint(grid: EmissionGrid, values: Float64Array, legend: Entry[]): string {
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

interface PanelProps {
  villageCode: string;
  villageName: string;
  /** Source picked in the parameter panel; the map follows it. */
  focus?: string | null;
  /** Scenario and survey emissions per Carbon Lab source (t CO2e/yr). */
  emissions: Record<string, number>;
  baseline: Record<string, number>;
}

/** Right-hand Carbon Lab panel: the emission raster of the source selected on the left, recomputed for the slider
 *  scenario from the GeoServer cells of this village; uploaded GeoServer layers can be shown instead. */
export default function FactorPanel({ villageCode, villageName, focus, emissions, baseline }: PanelProps) {
  const { data: grid, error: gridError, isLoading } = useEmissionGrid(villageCode);
  const { data: allFactors = [] } = useRasterFactors();
  const uploads = useMemo(() => allFactors.filter((f) => f.kind === "upload"), [allFactors]);
  const { user } = useAuth();
  const [scope, setScope] = useState<"source" | "total">("source");
  const [extra, setExtra] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.8);
  const [showParcels, setShowParcels] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const { data: cadastral } = useVillageCadastral(villageCode);
  const cadastralBoundary = !!cadastral?.features.some((f) => f.properties?.kind === "boundary");
  const extraFactor = uploads.find((f) => f.layer === extra) ?? null;
  const { data: extraStats, isLoading: extraLoading } = useFactorStats(extraFactor?.layer ?? null, villageCode);

  const raster = scope === "total" ? "total" : (focus && RASTER_OF[focus]) || "total";
  // Scenario ÷ survey per raster source.
  const ratio = useMemo(() => Object.fromEntries(Object.entries(RASTER_GROUPS).map(([r, keys]) => {
    const base = keys.reduce((s, k) => s + (baseline[k] ?? 0), 0);
    const now = keys.reduce((s, k) => s + (emissions[k] ?? 0), 0);
    return [r, base > 0 ? now / base : 0];
  })), [emissions, baseline]);
  const values = useMemo(() => (grid ? scenarioRaster(grid, raster, ratio) : null), [grid, raster, ratio]);
  const legend = grid?.legends[raster] ?? [];
  const url = useMemo(() => (grid && values ? paint(grid, values, legend) : null), [grid, values, legend]);

  const title = grid?.titles[raster] ?? "Emissions";
  const summary = useMemo(() => {
    if (!grid || !values) return null;
    let total = 0, peak = 0, cells = 0, emitting = 0;
    const counts = new Array(legend.length).fill(0);
    values.forEach((v, i) => {
      if (!grid.inside[i]) return;
      cells++;
      total += v * grid.cell_ha[Math.floor(i / grid.width)];
      peak = Math.max(peak, v);
      if (v > 0) {
        emitting++;
        const k = classOf(legend, v);
        counts[k < 0 ? legend.length - 1 : k]++;
      }
    });
    return { total, peak, cells, emitting, shares: counts.map((c) => (cells ? (100 * c) / cells : 0)) };
  }, [grid, values, legend]);
  const surveyTotal = raster === "total"
    ? Object.values(baseline).reduce((a, b) => a + b, 0)
    : RASTER_GROUPS[raster].reduce((s, k) => s + (baseline[k] ?? 0), 0);
  const change = summary && surveyTotal > 0 ? (summary.total / surveyTotal - 1) * 100 : 0;

  const overlay = useMemo<GridOverlay | null>(() => grid && url && values ? {
    url, bounds: grid.bounds, title: `${title} (scenario)`,
    read: (lat, lng) => {
      const [w, s, e, n] = grid.bounds;
      const c = Math.floor(((lng - w) / (e - w)) * grid.width), r = Math.floor(((n - lat) / (n - s)) * grid.height);
      if (c < 0 || r < 0 || c >= grid.width || r >= grid.height || !grid.inside[r * grid.width + c]) return null;
      const v = values[r * grid.width + c];
      return v > 0 ? `${num(v)} t CO₂e/ha/yr` : "No emission from this source here";
    },
  } : null, [grid, url, values, title]);

  const rebuild = async () => {
    setRebuilding(true);
    try {
      await sendApi("POST", "/api/geo/emission-rasters");
      await refreshAll();
    } catch (err) {
      alert(errorText(err));
    } finally {
      setRebuilding(false);
    }
  };

  const remove = async (f: RasterFactor) => {
    if (!confirm(`Remove "${f.title}" from GeoServer?`)) return;
    try {
      await sendApi("DELETE", `/api/geo/factors/${f.name}`);
      if (extra === f.layer) setExtra(null);
      await mutate("/api/geo/factors");
    } catch (err) {
      alert(errorText(err));
    }
  };

  return (
    <aside className="lab-panel factor-panel">
      <div className="lab-panel-head">
        <h4><Layers size={16} /> Emission map</h4>
        <span className="factor-toggles">
          <span className="factor-scope" role="group" aria-label="Raster">
            <button type="button" className={scope === "source" && !extraFactor ? "active" : ""} onClick={() => { setScope("source"); setExtra(null); }}>
              Selected
            </button>
            <button type="button" className={scope === "total" && !extraFactor ? "active" : ""} onClick={() => { setScope("total"); setExtra(null); }}>
              All sources
            </button>
          </span>
          {cadastralBoundary && (
            <label className="factor-clip"><input type="checkbox" checked={showParcels} onChange={(e) => setShowParcels(e.target.checked)} /> Khasra</label>
          )}
        </span>
      </div>

      <FactorMap villageCode={villageCode} overlay={overlay} factor={extraFactor} opacity={opacity} parcels={showParcels} />
      <p className="factor-boundary">
        Boundary: {cadastralBoundary ? <><b>cadastral</b> (dissolved from {fmt(cadastral!.features.length - 1)} khasra parcels)</> : <><b>census</b> (no khasra parcels for this village)</>}
      </p>

      {extraFactor ? (
        <div className="factor-legend">
          <div className="factor-legend-head">
            <b>{extraFactor.title}</b>
            <button type="button" className="btn-ghost" onClick={() => setExtra(null)}>Back to emissions</button>
          </div>
          {extraFactor.description && <p className="caption">{extraFactor.description}</p>}
          <Legend factor={extraFactor} stats={extraStats} />
          <VillageStats factor={extraFactor} stats={extraStats} loading={extraLoading} villageName={villageName} />
        </div>
      ) : (
        <div className="factor-legend">
          <div className="factor-legend-head">
            <b>{title}</b>
            <label className="factor-opacity">
              Opacity
              <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
            </label>
          </div>
          {isLoading && <p className="caption">Reading the emission rasters from GeoServer…</p>}
          {gridError && (
            <p className="factor-nodata">
              {errorText(gridError)}.{user?.role === "admin" ? " Use “Rebuild from latest data” below." : ""}
            </p>
          )}
          {summary && (
            <>
              <p className="caption">
                Follows the <b>{scope === "total" ? "sum of all sources" : "source selected on the left"}</b> and your sliders.{" "}
                <span className={`factor-scenario ${change > 0.5 ? "up" : change < -0.5 ? "down" : ""}`}>
                  {Math.abs(change) < 0.5 ? "= survey" : `${change > 0 ? "+" : ""}${fmt(change, 0)}% vs survey`}
                </span>
              </p>
              <ul className="factor-classes">
                {legend.map((l, i) => l.opacity > 0 && (
                  <li key={i}>
                    <span className="factor-dot" style={{ background: l.color }} />
                    <span className="factor-class-label">{l.label}</span>
                    <span className="factor-bar"><span style={{ width: `${summary.shares[i]}%`, background: l.color }} /></span>
                    <span className="factor-pct">{fmt(summary.shares[i], 1)}%</span>
                  </li>
                ))}
              </ul>
              <dl className="factor-stats">
                <div><dt>{villageName} total</dt><dd>{num(summary.total, "t/yr")}</dd></div>
                <div><dt>Peak cell</dt><dd>{num(summary.peak, "t/ha")}</dd></div>
                <div><dt>Area emitting</dt><dd>{fmt(summary.cells ? (100 * summary.emitting) / summary.cells : 0, 0)}%</dd></div>
              </dl>
              <p className="caption">
                {grid?.unit} on ~98 m cells, spread over land cover (LULC). Survey rasters from GeoServer
                {grid?.generated_at && <> (built {new Date(grid.generated_at).toLocaleDateString()})</>}, rescaled in the browser for the scenario.
              </p>
            </>
          )}
          {user?.role === "admin" && (
            <button type="button" className="btn-ghost factor-rebuild" onClick={rebuild} disabled={rebuilding}>
              <RefreshCw size={12} className={rebuilding ? "spin" : ""} /> {rebuilding ? "Rebuilding…" : "Rebuild from latest data"}
            </button>
          )}
        </div>
      )}

      <details className="factor-extra">
        <summary>Uploaded layers ({uploads.length})</summary>
        {uploads.map((f) => (
          <label key={f.layer} className={`factor-item ${f.layer === extra ? "active" : ""}`}>
            <input type="radio" name="extra-layer" checked={f.layer === extra} onChange={() => setExtra(f.layer)} />
            <span className="factor-swatch" style={{ background: swatch(f) }} />
            <span className="factor-name">{f.title}</span>
            {user && (user.role === "admin" || user.username === f.uploaded_by) && (
              <button type="button" className="icon-btn" aria-label={`Remove ${f.title}`} onClick={(e) => { e.preventDefault(); remove(f); }}>
                <Trash2 size={14} />
              </button>
            )}
          </label>
        ))}
        <AddFactor loggedIn={!!user} onAdded={(f) => setExtra(f.layer)} />
      </details>
    </aside>
  );
}

const swatch = (f: RasterFactor) => {
  const legend = shownLegend(f);
  return legend.length > 1 ? `linear-gradient(90deg, ${legend.map((l) => l.color).join(", ")})` : legend[0]?.color ?? "#b0bec5";
};

function Legend({ factor: f, stats }: { factor: RasterFactor; stats?: VillageFactorStats }) {
  const factor = { ...f, legend: shownLegend(f) };
  if (!factor.legend.length) {
    // No ColorMap in the style: fall back to GeoServer's own legend image.
    const q = new URLSearchParams({ service: "WMS", request: "GetLegendGraphic", format: "image/png", layer: factor.layer });
    return <img className="factor-legend-img" src={`${wmsUrl(factor.workspace)}?${q}`} alt={`${factor.title} legend`} />;
  }
  if (factor.legend_type === "ramp") {
    const { legend } = factor;
    const lo = legend[0].quantity, hi = legend.at(-1)!.quantity;
    const pos = stats?.mean != null && hi > lo ? Math.min(100, Math.max(0, ((stats.mean - lo) / (hi - lo)) * 100)) : null;
    return (
      <div className="factor-ramp">
        <div className="factor-ramp-bar" style={{ background: `linear-gradient(90deg, ${legend.map((l) => l.color).join(", ")})` }}>
          {pos != null && <span className="factor-ramp-mark" style={{ left: `${pos}%` }} title="Village mean" />}
        </div>
        <div className="factor-ramp-labels">
          {legend.map((l, i) => <span key={i}>{l.label}</span>)}
        </div>
        {factor.unit && <p className="caption">Unit: {factor.unit}</p>}
      </div>
    );
  }
  const share = new Map(stats?.classes.map((c) => [c.label, c.share_pct]));
  return (
    <ul className="factor-classes">
      {factor.legend.map((l, i) => {
        const pct = share.get(l.label) ?? 0;
        return (
          <li key={i}>
            <span className="factor-dot" style={{ background: l.color }} />
            <span className="factor-class-label">{l.label}</span>
            {stats?.covered && (
              <>
                <span className="factor-bar"><span style={{ width: `${pct}%`, background: l.color }} /></span>
                <span className="factor-pct">{fmt(pct, 1)}%</span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function VillageStats({ factor, stats, loading, villageName }: { factor: RasterFactor; stats?: VillageFactorStats; loading: boolean; villageName: string }) {
  if (loading) return <p className="caption">Reading raster inside {villageName}…</p>;
  if (!stats) return null;
  if (!stats.covered) {
    return <p className="factor-nodata">No raster data inside {villageName}: the village lies outside this layer&apos;s extent or only covers nodata pixels.</p>;
  }
  if (factor.kind === "emission") {
    const emitting = stats.classes.reduce((s, c) => s + c.share_pct, 0);
    return (
      <>
        <dl className="factor-stats">
          <div><dt>{villageName} total</dt><dd>{num(stats.total, "t/yr")}</dd></div>
          <div><dt>Peak cell</dt><dd>{num(stats.max, "t/ha")}</dd></div>
          <div><dt>Area emitting</dt><dd>{fmt(emitting, 0)}%</dd></div>
        </dl>
        {emitting < 99.5 && (
          <p className="caption">{fmt(100 - emitting, 0)}% of the village (other land cover) gets none of this source.</p>
        )}
      </>
    );
  }
  if (factor.legend_type === "values" && stats.classes.length) {
    // Categorical raster (e.g. land use): a mean of class codes means nothing, so report the dominant class.
    const top = stats.classes.reduce((a, b) => (b.share_pct > a.share_pct ? b : a));
    return (
      <dl className="factor-stats">
        <div><dt>Dominant in {villageName}</dt><dd>{top.label} ({fmt(top.share_pct, 0)}%)</dd></div>
        <div><dt>Classes present</dt><dd>{stats.classes.length}</dd></div>
        <div><dt>Pixels</dt><dd>{fmt(stats.valid_pixels)} of {fmt(stats.pixels)}</dd></div>
      </dl>
    );
  }
  return (
    <dl className="factor-stats">
      <div><dt>Mean in {villageName}</dt><dd>{num(stats.mean, factor.unit)}</dd></div>
      <div><dt>Range</dt><dd>{num(stats.min)} – {num(stats.max, factor.unit)}</dd></div>
      <div><dt>Pixels</dt><dd>{fmt(stats.valid_pixels)} of {fmt(stats.pixels)}</dd></div>
    </dl>
  );
}

function AddFactor({ loggedIn, onAdded }: { loggedIn: boolean; onAdded: (f: RasterFactor) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("");
  const [description, setDescription] = useState("");
  const [ramp, setRamp] = useState("viridis");
  const [tif, setTif] = useState<File | null>(null);
  const [sld, setSld] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!tif) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("title", title);
      if (unit) body.append("unit", unit);
      if (description) body.append("description", description);
      body.append("ramp", ramp);
      body.append("tif", tif);
      if (sld) body.append("sld", sld);
      const added = await sendApi<RasterFactor>("POST", "/api/geo/factors", body);
      await mutate("/api/geo/factors");
      onAdded(added);
      setOpen(false);
      setTitle(""); setUnit(""); setDescription(""); setTif(null); setSld(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="btn-ghost factor-add-btn" onClick={() => setOpen(true)}>
        <Plus size={14} /> Add a factor raster
      </button>
    );
  }
  return (
    <form className="factor-form" onSubmit={submit}>
      <h5>Add a factor raster</h5>
      {!loggedIn ? (
        <p className="caption"><Link href="/login">Log in</Link> to push a new factor to GeoServer.</p>
      ) : (
        <>
          <p className="caption">The GeoTIFF is pushed to GeoServer&apos;s temporary workspace and appears under &quot;Added factors&quot; for everyone.</p>
          <label className="field"><span>Name *</span>
            <input required minLength={2} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Land surface temperature" />
          </label>
          <div className="factor-form-row">
            <label className="field"><span>Unit</span><input maxLength={30} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="°C, t/ha…" /></label>
            <label className="field"><span>Colour ramp</span>
              <select value={ramp} onChange={(e) => setRamp(e.target.value)} disabled={!!sld}>
                {Object.keys(RAMPS).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          </div>
          <span className="factor-swatch wide" style={{ background: `linear-gradient(90deg, ${RAMPS[ramp].join(", ")})`, opacity: sld ? 0.3 : 1 }} />
          <label className="field"><span>Description</span>
            <textarea maxLength={500} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="field"><span>GeoTIFF (single band) *</span>
            <input type="file" required accept=".tif,.tiff,image/tiff" onChange={(e) => setTif(e.target.files?.[0] ?? null)} />
          </label>
          <label className="field"><span>SLD style (optional, replaces the ramp)</span>
            <input type="file" accept=".sld,.xml" onChange={(e) => setSld(e.target.files?.[0] ?? null)} />
          </label>
          {error && <div className="alert error">{error}</div>}
        </>
      )}
      <div className="factor-form-actions">
        <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
        {loggedIn && (
          <button type="submit" className="btn primary" disabled={busy || !tif || title.trim().length < 2}>
            <Upload size={14} /> {busy ? "Pushing to GeoServer…" : "Push to GeoServer"}
          </button>
        )}
      </div>
    </form>
  );
}
