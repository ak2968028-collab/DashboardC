"""Carbon emission rasters built from the village emission inventory and published to GeoServer.

Each village's yearly emissions per source (t CO2e/yr) are spread over the cells inside its boundary, weighted by
land cover from the LULC raster: household energy lands on built-up cells, livestock on grazing land and cropland,
and so on (ALLOCATION). Cells are 3x3 LULC pixels (~90 m). Where a village has no LULC coverage, or none of the
land cover a source is tied to, its emissions are spread evenly over the village. Values are densities in
t CO2e/ha/yr, so a village's cells sum back to its inventory total."""
import io
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import numpy as np
import shapely
from PIL import Image, TiffImagePlugin

from app.api.service.geoserver_svc import factors
from app.api.service.geoserver_svc.geoserver import _ensure_workspace, _publish_style, _request, rest_get
from app.conf.settings import settings

EMISSION_WORKSPACE = settings.GEOSERVER_EMISSION_WORKSPACE
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


def _lulc() -> tuple[np.ndarray, float, float, float, dict[int, str], float]:
    """(class codes, x0, y0, pixel size, code -> label, nodata) of the LULC raster."""
    tif = settings.RASTER_DIR / "files" / "condition" / f"{LULC_TIF}.tif"
    sld = settings.RASTER_DIR / "SLD" / "condition" / f"{LULC_TIF}.sld"
    codes, nodata, transform = factors._read_geotiff(tif.read_bytes())
    x0, dx, y0, dy = transform
    if abs(abs(dx) - abs(dy)) > 1e-9:
        raise ValueError("LULC pixels must be square")
    _, legend = factors.parse_legend(sld.read_bytes())
    labels = {int(e["quantity"]): e["label"] for e in legend}
    return codes.astype(np.int32), x0, y0, dx, labels, nodata if nodata is not None else -1


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


def _fmt(v: float) -> str:
    return f"{v:,.0f}" if v >= 100 else f"{v:.2f}" if v >= 1 else f"{v:.3f}"


def _sld(name: str, values: np.ndarray) -> bytes:
    """Interval colour map on quantile breaks of the non-zero cells; zero cells are transparent."""
    positive = values[values > 0]
    breaks = np.unique(np.quantile(positive, [0.25, 0.5, 0.7, 0.85, 0.95, 0.99])) if positive.size else np.array([1.0])
    uppers = [float(b) for b in breaks] + [float(positive.max()) * 1.001 + 1e-9 if positive.size else 2.0]
    entries = ['<ColorMapEntry color="#000000" quantity="1e-9" opacity="0" label="none"/>']
    lower = 0.0
    for i, upper in enumerate(uppers):
        color = RAMP[round(i * (len(RAMP) - 1) / max(len(uppers) - 1, 1))]
        label = (f"&gt; {_fmt(lower)}" if i == len(uppers) - 1 else f"&lt; {_fmt(upper)}" if i == 0
                 else f"{_fmt(lower)} – {_fmt(upper)}")
        entries.append(f'<ColorMapEntry color="{color}" quantity="{upper!r}" label="{label}"/>')
        lower = upper
    rows = "\n        ".join(entries)
    sld = f'''<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc">
  <NamedLayer><Name>{name}</Name><UserStyle><Name>{name}</Name><FeatureTypeStyle><Rule>
    <RasterSymbolizer><Opacity>1.0</Opacity>
      <ColorMap type="intervals">
        {rows}
      </ColorMap>
    </RasterSymbolizer>
  </Rule></FeatureTypeStyle></UserStyle></NamedLayer>
</StyledLayerDescriptor>'''
    ET.fromstring(sld)  # fail early on a malformed style
    return sld.encode()


def _publish(name: str, title: str, abstract: str, tif: bytes, sld: bytes, keywords: list[str]):
    store = f"/workspaces/{EMISSION_WORKSPACE}/coveragestores/{name}"
    if _request("GET", store) != 404:
        _request("DELETE", f"{store}?recurse=true&purge=all")
    _request("PUT", f"{store}/file.geotiff?configure=first&coverageName={name}", tif, content_type="image/tiff", timeout=300)
    _request("PUT", f"{store}/coverages/{name}", {"coverage": {
        "title": title, "abstract": abstract, "keywords": {"string": keywords}, "enabled": True,
    }})
    _publish_style(name, workspace=EMISSION_WORKSPACE, sld=sld)
    _request("PUT", f"/layers/{EMISSION_WORKSPACE}:{name}", {"layer": {"defaultStyle": {"name": name, "workspace": EMISSION_WORKSPACE}}})


def generate(villages: list[dict]) -> dict:
    """Builds one raster per source (plus the total) from the village inventory and publishes them to GeoServer."""
    factors._require_geoserver()
    lulc, lx0, ly0, px, labels, lulc_nodata = _lulc()
    shapes = factors._village_shapes()
    by_code = {v["village_code"]: v for v in villages}
    shapes = {c: g for c, g in shapes.items() if c in by_code}

    # Output grid: whole district, aligned to LULC blocks so each cell covers exactly BLOCK x BLOCK pixels.
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
    has_lulc = (blocks != lulc_nodata).any(axis=(1, 3))

    vid = _village_cells(shapes, gx0, gy0, res, (h, w))
    flat = vid.ravel()
    inside = flat >= 0
    n = len(shapes)
    cells_per_village = np.bincount(flat[inside], minlength=n)
    lulc_per_village = np.bincount(flat[inside], weights=has_lulc.ravel()[inside], minlength=n)
    lat = gy0 - (np.arange(h) + 0.5) * res
    cell_ha = ((res * 111_320 * np.cos(np.radians(lat))) * (res * 110_574) / 1e4)[:, None] * np.ones((1, w))

    codes = list(shapes)
    generated = datetime.now(timezone.utc).isoformat(timespec="seconds")
    published, densities = [], {}
    for key, (title, column, weights) in ALLOCATION.items():
        if key == "total":
            continue
        totals = np.array([float(by_code[c].get(column) or 0) for c in codes])
        weight = sum((fractions.get(label, 0) * wt for label, wt in weights.items()), np.zeros((h, w))).ravel()
        wsum = np.bincount(flat[inside], weights=weight[inside], minlength=n)
        share = np.zeros(h * w)
        idx = flat[inside]
        tied = wsum[idx] > 0
        share_in = np.where(tied, weight[inside] / np.where(wsum[idx] > 0, wsum[idx], 1), 1 / cells_per_village[idx])
        share[inside] = share_in
        tonnes = np.zeros(h * w)
        tonnes[inside] = totals[idx] * share[inside]
        densities[key] = (tonnes.reshape(h, w) / cell_ha)
    densities["total"] = sum(densities.values())

    placed_t = {k: float((d * cell_ha).sum()) for k, d in densities.items()}
    _ensure_workspace(EMISSION_WORKSPACE)
    for key, (title, column, weights) in ALLOCATION.items():
        name = f"emission_{key}"
        d = np.where(vid >= 0, densities[key], NODATA)
        basis = ", ".join(f"{label} {wt:.0%}" for label, wt in weights.items()) if weights else "sum of all sources"
        abstract = (f"Village inventory ({column}) spread over ~{res * 111_000:.0f} m cells by LULC land cover: {basis}. "
                    f"Villages without LULC coverage are spread evenly. Generated {generated[:10]}.")
        _publish(name, title, abstract, _geotiff(d, gx0, gy0, res), _sld(name, densities[key][vid >= 0]),
                 ["kind=emission", f"unit={UNIT}", f"source={key}", f"at={generated}"])
        published.append(f"{EMISSION_WORKSPACE}:{name}")

    factors.list_factors(refresh=True)
    factors.village_stats.cache_clear()
    no_boundary = [v["village_code"] for v in villages if v["village_code"] not in shapes]
    return {
        "layers": published,
        "grid": {"width": w, "height": h, "cell_m": round(res * 111_000), "origin": [float(gx0), float(gy0)]},
        "villages_placed": n,
        "villages_without_boundary": len(no_boundary),
        "villages_without_lulc": int((lulc_per_village == 0).sum()),
        "inventory_t": round(sum(float(v.get("total_co2e_t_yr") or 0) for v in villages), 1),
        "placed_t": round(placed_t["total"], 1),
        "generated_at": generated,
    }


async def regenerate(db) -> dict:
    """Reads the current village inventory and rebuilds every emission raster."""
    from fastapi.concurrency import run_in_threadpool

    from app.database.crud.village.async_crud import Village_crud
    villages = await Village_crud(db).get_records()
    return await run_in_threadpool(generate, villages)


def status() -> dict | None:
    """Generation time of the published total-emission raster, or None when not generated yet."""
    if not settings.GEOSERVER_URL:
        return None
    cov = (rest_get(f"/workspaces/{EMISSION_WORKSPACE}/coverages/emission_total.json") or {}).get("coverage")
    return {"generated_at": factors._keywords(cov).get("at")} if cov else None
