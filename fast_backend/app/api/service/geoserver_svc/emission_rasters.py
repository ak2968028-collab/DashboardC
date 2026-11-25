"""Carbon emission rasters, computed on demand from the village emission inventory (nothing is published permanently).

Each village's yearly emissions per source (t CO2e/yr) are spread over the cells inside its boundary, weighted by
land cover from the LULC raster: household energy lands on built-up cells, livestock on grazing land and cropland,
and so on (ALLOCATION). Cells are 3x3 LULC pixels (~30 m). Where a village has no LULC coverage, or none of the
land cover a source is tied to, its emissions are spread evenly over the village. Values are densities in
t CO2e/ha/yr, so a village's cells sum back to its inventory total.

Inputs: emissions and boundaries from the database, LULC from GeoServer (varanasi_raster:lulc_priority).
  district_grid()  the whole-district computation, cached in memory until emissions are recomputed (invalidate())
  village_grid()   one village's cells (Carbon Lab, Comparison page, Advanced report)
  region()         cells of an area / villages / the district as a GeoTIFF + style, for the AI assistant's temporary
                   GeoServer layers (chat_svc/temp_rasters.py)"""
import io
import threading
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from functools import lru_cache

import numpy as np
import shapely
from fastapi import HTTPException, status
from PIL import Image, TiffImagePlugin

from app.api.service.geoserver_svc import factors
from app.api.service.geoserver_svc.geoserver import (
    RASTER_WORKSPACE, _ensure_workspace, _publish_style, _request, ows_get, rest_get,
)
from app.conf.settings import settings

LULC_TIF = "lulc_priority"
BLOCK = 3            # LULC pixels per output cell side
NODATA = -9999.0
UNIT = "t CO2e/ha/yr"

# Share of a source's emissions that goes to each land-cover class (by LULC legend label), before normalising
# within the village. The LULC has no road or dump class, so transport and waste lean on built-up land.
ALLOCATION: dict[str, tuple[str, str, dict[str, float]]] = {
    # key: (title, inventory column, class weights)
    "total": ("Total emissions", "total_co2e_t_yr", {}),
    "lpg": ("LPG cooking", "lpg_co2e_t_yr", {"Builtup Area": 1.0}),
    "firewood": ("Firewood (chulha)", "firewood_co2e_t_yr", {"Builtup Area": 1.0}),
    "electricity": ("Grid electricity", "electricity_co2e_t_yr", {"Builtup Area": 1.0}),
    "transport": ("Motorbike petrol", "transport_co2e_t_yr", {"Builtup Area": 0.75, "Cropland": 0.15, "Bare Ground": 0.1}),
    "waste": ("Solid waste", "waste_co2e_t_yr", {"Builtup Area": 0.6, "Bare Ground": 0.4}),
    "livestock": ("Livestock", "livestock_co2e_t_yr", {"Rangeland": 0.35, "Cropland": 0.35, "Builtup Area": 0.3}),
}
RAMP = ["#ffffb2", "#fed976", "#feb24c", "#fd8d3c", "#f03b20", "#bd0026", "#67000d"]
ASSISTANT_WORKSPACE = settings.GEOSERVER_ASSISTANT_TEMP_WORKSPACE

_cache: dict = {"grid": None}
_lock = threading.Lock()


def _lulc() -> tuple[np.ndarray, float, float, float, dict[int, str], float]:
    """(class codes, x0, y0, pixel size, code -> label, nodata) of the LULC raster, read from GeoServer (published by
    script/geoserver_raster.py): the whole coverage over WCS and the class labels from its style."""
    factors._require_geoserver()
    legend = factors.get_factor(f"{RASTER_WORKSPACE}:{LULC_TIF}")["legend"]
    tif = ows_get(f"/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId={RASTER_WORKSPACE}__{LULC_TIF}"
                  "&format=image/tiff", timeout=300)
    codes, nodata, transform = factors._read_geotiff(tif)
    x0, dx, y0, dy = transform
    if abs(abs(dx) - abs(dy)) > 1e-9:
        raise ValueError("LULC pixels must be square")
    labels = {int(e["quantity"]): e["label"] for e in legend}
    return codes.astype(np.int32), x0, y0, dx, labels, nodata if nodata is not None else -1


def _inventory() -> list[dict]:
    """Village emissions per source from the database."""
    from sqlalchemy import create_engine, text

    cols = ", ".join(f"e.{c}" for _, c, _ in ALLOCATION.values())
    engine = create_engine(settings.DATABASE_SYNC_URL)
    try:
        with engine.connect() as con:
            rows = con.execute(text(f"SELECT v.village_code, {cols} FROM villages v "
                                    "JOIN village_emissions e ON e.village_id = v.id"))
            return [dict(r._mapping) for r in rows]
    finally:
        engine.dispose()


def _village_cells(shapes: dict[str, object], x0: float, y0: float, res: float, shape: tuple[int, int]) -> np.ndarray:
    """Index (into the shapes order) of the village whose boundary contains each cell centre; -1 outside."""
    h, w = shape
    vid = np.full(shape, -1, np.int32)
    for i, geom in enumerate(shapes.values()):
        minx, miny, maxx, maxy = geom.bounds
        c0, c1 = max(0, int((minx - x0) / res)), min(w, int((maxx - x0) / res) + 1)
        r0, r1 = max(0, int((y0 - maxy) / res)), min(h, int((y0 - miny) / res) + 1)
        if c0 >= c1 or r0 >= r1:
            continue
        cols, rows = np.meshgrid(np.arange(c0, c1), np.arange(r0, r1))
        inside = shapely.contains_xy(geom, x0 + (cols + 0.5) * res, y0 - (rows + 0.5) * res)
        vid[r0:r1, c0:c1][inside] = i
    return vid


def _compute() -> dict:
    """Spreads every village's emissions over the district grid (see the module docstring)."""
    villages = _inventory()
    lulc, lx0, ly0, px, labels, lulc_nodata = _lulc()
    shapes = factors._village_shapes()
    by_code = {v["village_code"]: v for v in villages}
    shapes = {c: g for c, g in shapes.items() if c in by_code}
    if not shapes:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No village boundaries with emissions")

    # Grid: whole district, aligned to LULC blocks so each cell covers exactly BLOCK x BLOCK pixels.
    res = px * BLOCK
    minx, miny, maxx, maxy = shapely.total_bounds(np.array(list(shapes.values())))
    gx0 = lx0 - np.ceil(max(0.0, lx0 - minx) / res) * res
    gy0 = ly0 + np.ceil(max(0.0, maxy - ly0) / res) * res
    w, h = int(np.ceil((maxx - gx0) / res)), int(np.ceil((gy0 - miny) / res))
    fine = np.full((h * BLOCK, w * BLOCK), lulc_nodata, np.int32)
    oc, orow = int(round((lx0 - gx0) / px)), int(round((gy0 - ly0) / px))
    src = lulc[: fine.shape[0] - orow, : fine.shape[1] - oc]
    fine[orow: orow + src.shape[0], oc: oc + src.shape[1]] = src
    blocks = fine.reshape(h, BLOCK, w, BLOCK)
    fractions = {label: (blocks == code).mean(axis=(1, 3)) for code, label in labels.items()}

    vid = _village_cells(shapes, gx0, gy0, res, (h, w))
    n = len(shapes)
    # Villages that own no cell (smaller than a cell, or covered by a neighbour) keep their emissions in the cell
    # under their own centre, so nothing is dropped.
    orphan_cells = {}
    owned = np.bincount(vid[vid >= 0], minlength=n)
    for i, geom in enumerate(shapes.values()):
        if owned[i] == 0:
            cx, cy = shapely.get_coordinates(shapely.point_on_surface(geom))[0]
            r, c = min(h - 1, int((gy0 - cy) / res)), min(w - 1, int((cx - gx0) / res))
            if vid[r, c] < 0:
                vid[r, c] = i
            else:
                orphan_cells[i] = r * w + c
    flat = vid.ravel()
    inside = flat >= 0
    cells_per_village = np.bincount(flat[inside], minlength=n)
    lat = gy0 - (np.arange(h) + 0.5) * res
    cell_ha = ((res * 111_320 * np.cos(np.radians(lat))) * (res * 110_574) / 1e4)[:, None] * np.ones((1, w))

    codes = list(shapes)
    densities = {}
    for key, (_title, column, weights) in ALLOCATION.items():
        if key == "total":
            continue
        totals = np.array([float(by_code[c].get(column) or 0) for c in codes])
        weight = sum((fractions.get(label, 0) * wt for label, wt in weights.items()), np.zeros((h, w))).ravel()
        wsum = np.bincount(flat[inside], weights=weight[inside], minlength=n)
        share = np.zeros(h * w)
        idx = flat[inside]
        tied = wsum[idx] > 0
        share[inside] = np.where(tied, weight[inside] / np.where(wsum[idx] > 0, wsum[idx], 1), 1 / cells_per_village[idx])
        tonnes = np.zeros(h * w)
        tonnes[inside] = totals[idx] * share[inside]
        for i, cell in orphan_cells.items():
            tonnes[cell] += totals[i]
        densities[key] = tonnes.reshape(h, w) / cell_ha
    densities["total"] = sum(densities.values())
    return {"densities": densities, "vid": vid, "codes": codes, "index": {c: i for i, c in enumerate(codes)},
            "shapes": shapes, "x0": float(gx0), "y0": float(gy0), "res": float(res), "width": w, "height": h,
            "cell_ha": cell_ha, "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "legends": {}}


def district_grid() -> dict:
    """The district emission grid, computed once and kept until invalidate()."""
    with _lock:
        if _cache["grid"] is None:
            _cache["grid"] = _compute()
        return _cache["grid"]


def invalidate():
    """Forget the cached grid (after the emissions are recomputed); the next request recomputes it."""
    with _lock:
        _cache["grid"] = None
    village_grid.cache_clear()


# ---------- legends & styles ----------

def _fmt(v: float) -> str:
    return f"{v:,.0f}" if v >= 100 else f"{v:.2f}" if v >= 1 else f"{v:.3f}"


def legend(key: str) -> list[dict]:
    """Interval colour classes on quantile breaks of the non-zero district cells (the same classes everywhere);
    the first entry ('none', transparent) holds the zero cells."""
    grid = district_grid()
    if key in grid["legends"]:
        return grid["legends"][key]
    values = grid["densities"][key][grid["vid"] >= 0]
    positive = values[values > 0]
    breaks = np.unique(np.quantile(positive, [0.25, 0.5, 0.7, 0.85, 0.95, 0.99])) if positive.size else np.array([1.0])
    uppers = [float(b) for b in breaks] + [float(positive.max()) * 1.001 + 1e-9 if positive.size else 2.0]
    entries = [{"color": "#000000", "quantity": 1e-9, "label": "none", "opacity": 0.0}]
    lower = 0.0
    for i, upper in enumerate(uppers):
        color = RAMP[round(i * (len(RAMP) - 1) / max(len(uppers) - 1, 1))]
        label = (f"> {_fmt(lower)}" if i == len(uppers) - 1 else f"< {_fmt(upper)}" if i == 0
                 else f"{_fmt(lower)} – {_fmt(upper)}")
        entries.append({"color": color, "quantity": upper, "label": label, "opacity": 1.0})
        lower = upper
    grid["legends"][key] = entries
    return entries


def sld(name: str, key: str) -> bytes:
    """GeoServer style for a raster of source `key` (classes from legend())."""
    rows = "\n        ".join(
        f'<ColorMapEntry color="{e["color"]}" quantity="{e["quantity"]!r}" opacity="{e["opacity"]}" '
        f'label="{e["label"].replace("<", "&lt;").replace(">", "&gt;")}"/>' for e in legend(key))
    doc = f'''<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc">
  <NamedLayer><Name>{name}</Name><UserStyle><Name>{name}</Name><FeatureTypeStyle><Rule>
    <RasterSymbolizer><Opacity>1.0</Opacity>
      <ColorMap type="intervals">
        {rows}
      </ColorMap>
    </RasterSymbolizer>
  </Rule></FeatureTypeStyle></UserStyle></NamedLayer>
</StyledLayerDescriptor>'''
    ET.fromstring(doc)  # fail early on a malformed style
    return doc.encode()


# ---------- regions (for the assistant's temporary rasters) ----------

def _mask(grid: dict, geom=None, codes=None) -> np.ndarray:
    """Cells of the district grid inside the area (cell centre in geom), the villages, or the whole district."""
    vid = grid["vid"]
    if codes is not None:
        wanted = [grid["index"][c] for c in codes if c in grid["index"]]
        return np.isin(vid, wanted)
    if geom is not None:
        h, w, x0, y0, res = grid["height"], grid["width"], grid["x0"], grid["y0"], grid["res"]
        cols, rows = np.meshgrid(np.arange(w), np.arange(h))
        return (vid >= 0) & shapely.contains_xy(geom, x0 + (cols + 0.5) * res, y0 - (rows + 0.5) * res)
    return vid >= 0


def _geotiff(values: np.ndarray, x0: float, y0: float, res: float) -> bytes:
    """Float32 GeoTIFF (EPSG:4326, pixel-is-area) written with Pillow's TIFF tags."""
    ifd = TiffImagePlugin.ImageFileDirectory_v2()
    for tag, typ, val in [
        (33550, 12, (res, res, 0.0)),                                   # ModelPixelScale
        (33922, 12, (0.0, 0.0, 0.0, x0, y0, 0.0)),                      # ModelTiepoint
        (34735, 3, (1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326)),  # GeoKeyDirectory
        (42113, 2, f"{NODATA:g}"),                                      # GDAL_NODATA
    ]:
        ifd[tag] = val
        ifd.tagtype[tag] = typ
    out = io.BytesIO()
    Image.fromarray(values.astype(np.float32), mode="F").save(out, format="TIFF", tiffinfo=ifd)
    return out.getvalue()


def region(key: str, geom=None, codes=None) -> dict:
    """The source-`key` raster cut to an area (geom), villages (codes) or the whole district: GeoTIFF bytes, its
    lon/lat bounds and statistics. Raises 404 when the area holds no village cell."""
    grid = district_grid()
    mask = _mask(grid, geom, codes)
    if not mask.any():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No surveyed village cells in this area")
    rows, cols = np.nonzero(mask)
    r0, r1, c0, c1 = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1
    res = grid["res"]
    x0, y0 = grid["x0"] + c0 * res, grid["y0"] - r0 * res
    window = grid["densities"][key][r0:r1, c0:c1]
    inside = mask[r0:r1, c0:c1]
    vals = window[inside]
    area_ha = grid["cell_ha"][r0:r1, c0:c1][inside]
    return {
        "tif": _geotiff(np.where(inside, window, NODATA), x0, y0, res),
        "bounds": [x0, y0 - (r1 - r0) * res, x0 + (c1 - c0) * res, y0],  # west, south, east, north
        "stats": {"cells": int(inside.sum()), "min": float(vals.min()), "max": float(vals.max()),
                  "mean": float(vals.mean()), "total": float((vals * area_ha).sum()), "covered": True},
    }


TEMP_MAX_AGE_S = 600  # assistant layers older than this are removed by cleanup_stale()


def publish_region(key: str, geom=None, codes=None) -> dict:
    """Publish one requested emission raster into the assistant-only workspace. Temporary: the assistant deletes it
    (delete_temporary) once the answer has been delivered; cleanup_stale() removes any left behind."""
    import time
    from uuid import uuid4

    factors._require_geoserver()
    result = region(key, geom=geom, codes=codes)
    name = f"emission_{key}_{uuid4().hex[:12]}"
    try:
        _ensure_workspace(ASSISTANT_WORKSPACE)
        store = f"/workspaces/{ASSISTANT_WORKSPACE}/coveragestores/{name}"
        _request("PUT", f"{store}/file.geotiff?configure=first&coverageName={name}", result["tif"],
                 content_type="image/tiff", timeout=300)
        _request("PUT", f"{store}/coverages/{name}", {"coverage": {
            "title": f"{ALLOCATION[key][0]} (assistant temporary)",
            "abstract": f"On-demand assistant emission density raster ({UNIT}); deleted once delivered.",
            "keywords": {"string": ["kind=assistant_temporary", f"source={key}", f"unit={UNIT}",
                                    f"at={int(time.time())}"]}, "enabled": True,
        }})
        _publish_style(name, workspace=ASSISTANT_WORKSPACE, sld=sld(name, key))
        _request("PUT", f"/layers/{ASSISTANT_WORKSPACE}:{name}", {"layer": {
            "defaultStyle": {"name": name, "workspace": ASSISTANT_WORKSPACE}}})
    except Exception:
        delete_temporary(name)
        raise
    return {"name": name, "layer": f"{ASSISTANT_WORKSPACE}:{name}", "workspace": ASSISTANT_WORKSPACE,
            "bounds": result["bounds"], "stats": result["stats"], "legend": legend(key)}


def delete_temporary(name: str):
    """Delete only the named assistant-generated coverage and its style."""
    if not name.startswith("emission_") or not all(c.isalnum() or c == "_" for c in name):
        return
    _request("DELETE", f"/workspaces/{ASSISTANT_WORKSPACE}/coveragestores/{name}?recurse=true&purge=all")
    _request("DELETE", f"/workspaces/{ASSISTANT_WORKSPACE}/styles/{name}?purge=true")


def cleanup_stale(max_age_s: int = TEMP_MAX_AGE_S) -> int:
    """Deletes assistant layers older than max_age_s (or without a timestamp): leftovers of failed requests."""
    import time

    listing = rest_get(f"/workspaces/{ASSISTANT_WORKSPACE}/coveragestores.json") or {}
    stores = ((listing.get("coverageStores") or {}).get("coverageStore") or []) if isinstance(listing, dict) else []
    removed = 0
    for store in stores:
        name = store["name"]
        cov = (rest_get(f"/workspaces/{ASSISTANT_WORKSPACE}/coverages/{name}.json") or {}).get("coverage") or {}
        at = factors._keywords(cov).get("at")
        if not at or time.time() - int(at) > max_age_s:
            delete_temporary(name)
            removed += 1
    return removed


# ---------- one village (Carbon Lab, Comparison page, Advanced report) ----------

@lru_cache(maxsize=256)
def village_grid(village_code: str) -> dict:
    """The village's cells of every source raster, so the dashboard can rescale them for a scenario: inside a village
    each source raster is linear in that village's emission for the source."""
    grid = district_grid()
    geom = grid["shapes"].get(village_code)
    if geom is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No boundary for village {village_code}")
    res, gx0, gy0 = grid["res"], grid["x0"], grid["y0"]
    minx, miny, maxx, maxy = geom.bounds
    # Cells whose centre lies within the village's bounding box.
    c0, c1 = max(0, int(np.ceil((minx - gx0) / res - 0.5))), min(grid["width"], int(np.floor((maxx - gx0) / res - 0.5)) + 1)
    r0, r1 = max(0, int(np.ceil((gy0 - maxy) / res - 0.5))), min(grid["height"], int(np.floor((gy0 - miny) / res - 0.5)) + 1)
    inside = grid["vid"][r0:r1, c0:c1] == grid["index"][village_code]
    h, w = inside.shape
    x0, y0 = gx0 + c0 * res, gy0 - r0 * res
    sources = [k for k in ALLOCATION if k != "total"]
    return {
        "village_code": village_code,
        "boundary": factors.boundary_source(village_code),
        "unit": UNIT,
        "bounds": [float(x0), float(y0 - h * res), float(x0 + w * res), float(y0)],  # west, south, east, north
        "width": int(w),
        "height": int(h),
        "cell_ha": [round(float(a), 4) for a in grid["cell_ha"][r0:r1, 0]],
        "inside": inside.ravel().astype(int).tolist(),
        "sources": {k: [round(float(v), 5) for v in np.where(inside, grid["densities"][k][r0:r1, c0:c1], 0).ravel()]
                    for k in sources},
        "legends": {k: legend(k) for k in ALLOCATION},
        "titles": {k: title for k, (title, _, _) in ALLOCATION.items()},
        "generated_at": grid["generated_at"],
    }
