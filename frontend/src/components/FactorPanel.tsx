"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Layers, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { mutate } from "swr";
import { errorText, refreshAll, sendApi, useFactorStats, useRasterFactors, wmsUrl } from "@/lib/api";
import { fmt } from "@/lib/format";
import type { RasterFactor, VillageFactorStats } from "@/lib/types";
import { useAuth } from "./AuthContext";

// Leaflet needs the browser window, so the map is client-only.
const FactorMap = dynamic(() => import("./FactorMap"), { ssr: false, loading: () => <div className="factor-map loading">Loading map…</div> });

const RAMPS: Record<string, string[]> = {
  viridis: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
  greens: ["#f7fcf5", "#c7e9c0", "#74c476", "#238b45", "#00441b"],
  reds: ["#fff5f0", "#fcbba1", "#fb6a4a", "#cb181d", "#67000d"],
  blues: ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"],
  spectral: ["#2b83ba", "#abdda4", "#ffffbf", "#fdae61", "#d7191c"],
};

const num = (v: number | null | undefined, unit?: string | null) =>
  v == null ? "–" : `${fmt(v, Math.abs(v) < 100 ? 2 : 0)}${unit ? ` ${unit}` : ""}`;

/** Carbon Lab source (left panel) -> emission raster source. */
const RASTER_SOURCE: Record<string, string> = {
  lpg: "lpg", firewood: "firewood", electricity: "electricity", petrol: "transport", waste: "waste",
  cow: "livestock", goat: "livestock", sheep: "livestock",
};

/** Legend entries that are drawn (transparent "no emission" classes are hidden). */
export const shownLegend = (f: RasterFactor) => f.legend.filter((l) => l.opacity > 0);

/** Right-hand Carbon Lab panel: carbon emission rasters (built from the village inventory and LULC) and added factors,
 *  served by GeoServer for the active village, with legend, village statistics and uploads. */
export default function FactorPanel({ villageCode, villageName, focus }: { villageCode: string; villageName: string; focus?: string | null }) {
  const { data: allFactors = [], error } = useRasterFactors();
  const factors = useMemo(() => allFactors.filter((f) => f.kind !== "condition"), [allFactors]);
  const { user } = useAuth();
  const [layer, setLayer] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.8);
  const [clip, setClip] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const factor = factors.find((f) => f.layer === layer) ?? null;
  const { data: stats, isLoading: statsLoading } = useFactorStats(factor?.layer ?? null, villageCode);
  const emissionLayer = (source: string) => factors.find((f) => f.kind === "emission" && f.source === source)?.layer;

  useEffect(() => {
    if (!factor && factors.length) setLayer(emissionLayer("total") ?? factors[0].layer);
  }, [factor, factors]);

  // Follow the source picked in the parameter panel / 3D scene.
  useEffect(() => {
    const target = focus ? emissionLayer(RASTER_SOURCE[focus]) : undefined;
    if (target) setLayer(target);
  }, [focus, factors]);

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
  const generatedAt = factors.find((f) => f.kind === "emission")?.uploaded_at;

  const groups = useMemo(() => {
    const out = new Map<string, RasterFactor[]>();
    for (const f of factors) out.set(f.group, [...(out.get(f.group) ?? []), f]);
    return [...out];
  }, [factors]);

  const remove = async (f: RasterFactor) => {
    if (!confirm(`Remove "${f.title}" from GeoServer?`)) return;
    try {
      await sendApi("DELETE", `/api/geo/factors/${f.name}`);
      if (layer === f.layer) setLayer(null);
      await mutate("/api/geo/factors");
    } catch (err) {
      alert(errorText(err));
    }
  };

  return (
    <aside className="lab-panel factor-panel">
      <div className="lab-panel-head">
        <h4><Layers size={16} /> Emission rasters</h4>
        <label className="factor-clip"><input type="checkbox" checked={clip} onChange={(e) => setClip(e.target.checked)} /> Clip to village</label>
      </div>

      <FactorMap villageCode={villageCode} factor={factor} opacity={opacity} clip={clip} />
      <p className="caption">
        Village emissions spread over land cover (LULC), served live from GeoServer. Click the map to read a cell.
        {generatedAt && <> Built {new Date(generatedAt).toLocaleDateString()}.</>}
        {user?.role === "admin" && (
          <button type="button" className="btn-ghost factor-rebuild" onClick={rebuild} disabled={rebuilding}>
            <RefreshCw size={12} className={rebuilding ? "spin" : ""} /> {rebuilding ? "Rebuilding…" : "Rebuild from latest data"}
          </button>
        )}
      </p>

      {error && <div className="alert error">Could not load rasters from GeoServer: {errorText(error)}</div>}

      <div className="factor-list" role="radiogroup" aria-label="Raster factor">
        {groups.map(([group, items]) => (
          <div key={group}>
            <div className="factor-group">{group}</div>
            {items.map((f) => (
              <label key={f.layer} className={`factor-item ${f.layer === layer ? "active" : ""}`}>
                <input type="radio" name="factor" checked={f.layer === layer} onChange={() => setLayer(f.layer)} />
                <span className="factor-swatch" style={{ background: swatch(f) }} />
                <span className="factor-name">{f.title}</span>
                {f.temporary && <span className="factor-temp" title={`Added by ${f.uploaded_by ?? "?"}`}>temp</span>}
                {f.temporary && user && (user.role === "admin" || user.username === f.uploaded_by) && (
                  <button type="button" className="icon-btn" aria-label={`Remove ${f.title}`} onClick={(e) => { e.preventDefault(); remove(f); }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </label>
            ))}
          </div>
        ))}
        {!factors.length && !error && (
          <p className="caption">No emission rasters on GeoServer yet. An admin can build them with “Rebuild from latest data”.</p>
        )}
      </div>

      {factor && (
        <div className="factor-legend">
          <div className="factor-legend-head">
            <b>{factor.title}</b>
            <label className="factor-opacity">
              Opacity
              <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
            </label>
          </div>
          {factor.description && <p className="caption">{factor.description}</p>}
          <Legend factor={factor} stats={stats} />
          <VillageStats factor={factor} stats={stats} loading={statsLoading} villageName={villageName} />
        </div>
      )}

      <AddFactor loggedIn={!!user} onAdded={(f) => setLayer(f.layer)} />
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
