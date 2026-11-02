"""Raster factors for the Carbon Lab map, read from GeoServer.

Curated rasters live in the raster workspace (published by script/geoserver_raster.py); factors added from the
dashboard are pushed to a separate temporary workspace. Both are listed straight from GeoServer, with legends parsed
from each layer's SLD, and per-village statistics come from the raster cut out of WCS for the village's bounds."""
import io
import json
import re
import threading
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from functools import lru_cache

import numpy as np
import shapely
from fastapi import HTTPException, status
from PIL import Image

from app.api.service.geoserver_svc.geoserver import (
    RASTER_WORKSPACE, _ensure_workspace, _publish_style, _request, find_rasters, ows_get, raster_title, rest_get,
)
from app.conf.settings import settings

TEMP_WORKSPACE = settings.GEOSERVER_TEMP_WORKSPACE
EMISSION_WORKSPACE = settings.GEOSERVER_EMISSION_WORKSPACE
WORKSPACES = (EMISSION_WORKSPACE, RASTER_WORKSPACE, TEMP_WORKSPACE)
KINDS = {EMISSION_WORKSPACE: 'emission', RASTER_WORKSPACE: 'condition', TEMP_WORKSPACE: 'upload'}
GROUPS = {EMISSION_WORKSPACE: 'Carbon emission', TEMP_WORKSPACE: 'Added factors'}
CACHE_SECONDS = 60
MAX_UPLOAD_MB = 150

# Colour ramps offered for factors uploaded without their own SLD.
RAMPS = {
    "greens": ["#f7fcf5", "#c7e9c0", "#74c476", "#238b45", "#00441b"],
    "reds": ["#fff5f0", "#fcbba1", "#fb6a4a", "#cb181d", "#67000d"],
    "blues": ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"],
    "viridis": ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
    "spectral": ["#2b83ba", "#abdda4", "#ffffbf", "#fdae61", "#d7191c"],
}
_TAG_NODATA, _TAG_TRANSFORM, _TAG_TIEPOINT, _TAG_SCALE, _TAG_GEOKEYS = 42113, 34264, 33922, 33550, 34735

_cache: dict = {"at": 0.0, "factors": None}
_lock = threading.Lock()


def _require_geoserver():
    if not settings.GEOSERVER_URL:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="GeoServer is not configured")


# ---------- legends ----------

def _local(tag: str) -> str:
    return tag.rsplit('}', 1)[-1]


def parse_legend(sld: bytes | None) -> tuple[str | None, list[dict]]:
    """(ColorMap type, entries) from the first ColorMap in an SLD; transparent entries (opacity 0) are kept so
    values can still be classed into them, and are left out of the drawn legend."""
    if not sld:
        return None, []
    try:
        root = ET.fromstring(sld)
    except ET.ParseError:
        return None, []
    cmap = next((el for el in root.iter() if _local(el.tag) == 'ColorMap'), None)
    if cmap is None:
        return None, []
    entries = []
    for el in cmap:
        if _local(el.tag) != 'ColorMapEntry':
            continue
        opacity = float(el.get('opacity') or 1)
        quantity = float(el.get('quantity', 'nan'))
        entries.append({
            'color': el.get('color', '#000000'), 'quantity': quantity, 'opacity': opacity,
            'label': el.get('label') or f"{quantity:g}",
        })
    return cmap.get('type', 'ramp'), entries


def _class_index(legend_type: str | None, quantities: np.ndarray, values: np.ndarray) -> np.ndarray:
    """Legend entry each value falls in (-1 when none): exact match for "values"; for "intervals" the first entry
    whose quantity is above the value (SLD: value < quantity); for ramps the nearest stop at or above it."""
    if legend_type == 'values':
        idx = np.full(values.shape, -1)
        for i, q in enumerate(quantities):
            idx[np.isclose(values, q)] = i
        return idx
    side = 'right' if legend_type == 'intervals' else 'left'
    return np.minimum(np.searchsorted(quantities, values, side=side), len(quantities) - 1)


# ---------- listing ----------

def _keywords(cov: dict) -> dict[str, str]:
    """Upload metadata stored as "key=value" coverage keywords."""
    raw = (cov.get('keywords') or {}).get('string', [])
    raw = [raw] if isinstance(raw, str) else raw
    return dict(k.split('=', 1) for k in raw if isinstance(k, str) and '=' in k)


def _factor(workspace: str, name: str, groups: dict[str, str]) -> dict | None:
    cov = (rest_get(f"/workspaces/{workspace}/coverages/{name}.json") or {}).get('coverage')
    if not cov:
        return None
    sld = None
    layer = rest_get(f"/layers/{workspace}:{name}.json")
    style = ((layer or {}).get('layer') or {}).get('defaultStyle') or {}
    if style.get('name'):
        style_name = style['name'].split(':')[-1]
        ws = style.get('workspace')
        sld = rest_get(f"/workspaces/{ws}/styles/{style_name}.sld" if ws else f"/styles/{style_name}.sld")
    legend_type, legend = parse_legend(sld)
    meta = _keywords(cov)
    bbox = cov.get('latLonBoundingBox') or {}
    temporary = workspace == TEMP_WORKSPACE
    title = cov.get('title') or name
    return {
        'name': name,
        'title': raster_title(name) if title == name else title,
        'workspace': workspace,
        'layer': f"{workspace}:{name}",
        'kind': meta.get('kind') or KINDS[workspace],
        'source': meta.get('source'),
        'group': GROUPS.get(workspace) or groups.get(name, 'Base factors').replace('_', ' ').title(),
        'temporary': temporary,
        'description': cov.get('abstract'),
        'unit': meta.get('unit'),
        'uploaded_by': meta.get('by'),
        'uploaded_at': meta.get('at'),
        'bbox': [bbox.get('minx'), bbox.get('miny'), bbox.get('maxx'), bbox.get('maxy')] if bbox else None,
        'legend_type': legend_type,
        'legend': legend,
    }


def _load_factors() -> list[dict]:
    groups = {tif.stem: tif.parent.name for tif, _ in find_rasters()}
    factors = []
    for ws in WORKSPACES:
        listing = rest_get(f"/workspaces/{ws}/coverages.json") or {}
        coverages = (listing.get('coverages') or {}).get('coverage', []) if isinstance(listing, dict) else []
        for c in coverages:
            f = _factor(ws, c['name'], groups)
            if f:
                factors.append(f)
    return factors


def list_factors(refresh: bool = False) -> list[dict]:
    if not settings.GEOSERVER_URL:
        return []
    with _lock:
        if refresh or _cache['factors'] is None or time.monotonic() - _cache['at'] > CACHE_SECONDS:
            _cache['factors'] = _load_factors()
            _cache['at'] = time.monotonic()
        return _cache['factors']


def get_factor(layer: str) -> dict:
    factor = next((f for f in list_factors() if f['layer'] == layer), None)
    if not factor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Raster factor {layer} not found on GeoServer")
    return factor


# ---------- GeoTIFF reading ----------

def _read_geotiff(data: bytes) -> tuple[np.ndarray, float | None, tuple[float, float, float, float] | None]:
    """(band values as float, nodata, (x0, dx, y0, dy) pixel-corner transform) for a single-band GeoTIFF."""
    im = Image.open(io.BytesIO(data))
    tags = im.tag_v2
    nodata = float(tags[_TAG_NODATA]) if _TAG_NODATA in tags else None
    transform = None
    if _TAG_TRANSFORM in tags:
        t = tags[_TAG_TRANSFORM]
        transform = (t[3], t[0], t[7], t[5])
    elif _TAG_TIEPOINT in tags and _TAG_SCALE in tags:
        tie, scale = tags[_TAG_TIEPOINT], tags[_TAG_SCALE]
        transform = (tie[3] - tie[0] * scale[0], scale[0], tie[4] + tie[1] * scale[1], -scale[1])
    return np.asarray(im, dtype=float), nodata, transform


def _valid(values: np.ndarray, nodata: float | None) -> np.ndarray:
    ok = np.isfinite(values)
    if nodata is not None:
        ok &= ~np.isclose(values, nodata)
    return ok


# ---------- upload / delete ----------

def _fmt(v: float) -> str:
    return f"{v:,.0f}" if abs(v) >= 100 else f"{v:,.2f}".rstrip('0').rstrip('.')


def _auto_sld(name: str, values: np.ndarray, ramp: str) -> bytes:
    """Colour map for an uploaded factor: one entry per class for categorical rasters, else a quantile ramp."""
    colors = RAMPS.get(ramp, RAMPS['viridis'])
    uniques = np.unique(values)
    if len(uniques) <= 12 and np.allclose(uniques, np.round(uniques)):
        picks = np.linspace(0, len(colors) - 1, len(uniques)) if len(uniques) > 1 else [len(colors) - 1]
        cmap_type = 'values'
        entries = [(colors[int(round(p))], float(q), _fmt(q)) for p, q in zip(picks, uniques)]
    else:
        breaks = np.unique(np.quantile(values, np.linspace(0.02, 0.98, len(colors))))
        cmap_type = 'ramp'
        entries = [(colors[int(round(i * (len(colors) - 1) / max(len(breaks) - 1, 1)))], float(q), _fmt(q)) for i, q in enumerate(breaks)]
    rows = "\n".join(f'          <ColorMapEntry color="{c}" quantity="{q!r}" label="{label}"/>' for c, q, label in entries)
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc">
  <NamedLayer><Name>{name}</Name><UserStyle><Name>{name}</Name><FeatureTypeStyle><Rule>
    <RasterSymbolizer><Opacity>1.0</Opacity>
      <ColorMap type="{cmap_type}">
{rows}
      </ColorMap>
    </RasterSymbolizer>
  </Rule></FeatureTypeStyle></UserStyle></NamedLayer>
</StyledLayerDescriptor>'''.encode()


def _unique_name(title: str) -> str:
    base = re.sub(r'[^a-z0-9]+', '_', title.lower()).strip('_')[:40] or 'factor'
    taken = {f['name'] for f in list_factors(refresh=True)}
    name, n = base, 2
    while name in taken:
        name, n = f"{base}_{n}", n + 1
    return name


def upload_factor(title: str, unit: str | None, description: str | None, ramp: str, tif: bytes, sld: bytes | None, username: str) -> dict:
    """Pushes a GeoTIFF to GeoServer's temporary workspace with its SLD (or an automatic colour map)."""
    _require_geoserver()
    if len(tif) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=f"GeoTIFF is larger than {MAX_UPLOAD_MB} MB")
    try:
        values, nodata, transform = _read_geotiff(tif)
    except Exception:
        values, nodata, transform = None, None, None
        if not sld:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="Could not read the GeoTIFF's pixel values; upload an SLD style along with it")
    if values is not None and transform is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The file has no georeferencing (not a GeoTIFF)")
    if values is not None and values.ndim != 2 and not sld:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Multi-band rasters need their own SLD style")
    if sld:
        try:
            ET.fromstring(sld)
        except ET.ParseError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The SLD file is not valid XML")
    else:
        valid = values[_valid(values, nodata)]
        if not valid.size:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The raster has no valid pixels")

    name = _unique_name(title)
    store = f"/workspaces/{TEMP_WORKSPACE}/coveragestores/{name}"
    _ensure_workspace(TEMP_WORKSPACE)
    _request('PUT', f"{store}/file.geotiff?configure=first&coverageName={name}", tif, content_type='image/tiff', timeout=300)
    keywords = [f"by={username}", f"at={datetime.now(timezone.utc).isoformat(timespec='seconds')}"] + ([f"unit={unit}"] if unit else [])
    _request('PUT', f"{store}/coverages/{name}", {'coverage': {
        'title': title, 'abstract': description or '', 'keywords': {'string': keywords}, 'enabled': True,
    }})
    _publish_style(name, workspace=TEMP_WORKSPACE, sld=sld or _auto_sld(name, valid, ramp))
    _request('PUT', f"/layers/{TEMP_WORKSPACE}:{name}", {'layer': {'defaultStyle': {'name': name, 'workspace': TEMP_WORKSPACE}}})
    list_factors(refresh=True)
    return get_factor(f"{TEMP_WORKSPACE}:{name}")


def delete_factor(name: str, username: str, is_admin: bool):
    _require_geoserver()
    factor = get_factor(f"{TEMP_WORKSPACE}:{name}")
    if not is_admin and factor['uploaded_by'] != username:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the uploader or an admin can remove this factor")
    _request('DELETE', f"/workspaces/{TEMP_WORKSPACE}/coveragestores/{name}?recurse=true&purge=all")
    _request('DELETE', f"/workspaces/{TEMP_WORKSPACE}/styles/{name}?purge=true")
    village_stats.cache_clear()
    list_factors(refresh=True)


# ---------- per-village statistics ----------

@lru_cache(maxsize=1)
def _village_shapes() -> dict[str, object]:
    geo = json.loads(settings.GEOJSON_LAYERS['villages'].read_text())
    return {
        str(f['properties'].get('village_code', '')).strip(): shapely.from_geojson(json.dumps(f['geometry']))
        for f in geo['features'] if f.get('geometry')
    }


@lru_cache(maxsize=512)
def village_stats(layer: str, village_code: str) -> dict:
    factor = get_factor(layer)
    geom = _village_shapes().get(village_code)
    if geom is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No boundary for village {village_code}")
    result = {'layer': layer, 'village_code': village_code, 'covered': False, 'pixels': 0, 'valid_pixels': 0,
              'min': None, 'max': None, 'mean': None, 'total': None, 'classes': []}
    minx, miny, maxx, maxy = geom.bounds
    b = factor['bbox']
    if not b or None in b or maxx < b[0] or minx > b[2] or maxy < b[1] or miny > b[3]:
        return result

    coverage_id = layer.replace(':', '__')
    tif = ows_get(f"/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId={coverage_id}"
                  f"&subset=Long({minx},{maxx})&subset=Lat({miny},{maxy})&format=image/tiff")
    values, nodata, transform = _read_geotiff(tif)
    if values.ndim != 2 or transform is None:
        return result
    x0, dx, y0, dy = transform
    rows, cols = np.indices(values.shape)
    lat = y0 + (rows + 0.5) * dy
    inside = shapely.contains_xy(geom, x0 + (cols + 0.5) * dx, lat)
    ok = inside & _valid(values, nodata)
    vals = values[ok]
    result['pixels'] = int(inside.sum())
    result['valid_pixels'] = int(vals.size)
    if not vals.size:
        return result
    result.update(covered=True, min=float(vals.min()), max=float(vals.max()), mean=float(vals.mean()))
    if factor['unit'] and '/ha' in factor['unit']:
        # Density raster: sum value x pixel area (ha) to get the village total.
        pixel_ha = (abs(dx) * 111_320 * np.cos(np.radians(lat[ok]))) * (abs(dy) * 110_574) / 1e4
        result['total'] = float((vals * pixel_ha).sum())
    if factor['legend']:
        quantities = np.array([e['quantity'] for e in factor['legend']])
        idx = _class_index(factor['legend_type'], quantities, vals)
        counts = np.bincount(idx[idx >= 0], minlength=len(quantities))
        result['classes'] = [
            {'label': e['label'], 'color': e['color'], 'share_pct': round(100 * int(c) / vals.size, 1)}
            for e, c in zip(factor['legend'], counts) if c and e['opacity'] > 0
        ]
    return result
