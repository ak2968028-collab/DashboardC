"""Vector areas uploaded to the AI assistant (GeoJSON, KML/KMZ, zipped shapefile, GeoPackage, GML).

An upload is reprojected to WGS84 and merged into one (multi)polygon: points and lines get a buffer, so "my wells" or
"this canal" still give an area. The assistant's analyze_area tool then clips the village data and the rasters to it.
Areas are kept as GeoJSON files in media/chat_areas/<id>.geojson (with their metadata) so they survive restarts."""
import json
import re
import tempfile
import uuid
import zipfile
from functools import lru_cache
from pathlib import Path

import geopandas as gpd
import shapely
from fastapi import HTTPException, status
from shapely.geometry import mapping, shape

from app.api.service.geoserver_svc import factors
from app.conf.settings import settings

AREA_DIR = settings.MEDIA_DIR / "chat_areas"
MAX_UPLOAD_MB = 20
BUFFER_M = 250             # buffer around uploaded points / lines
METRIC_CRS = "EPSG:32644"  # UTM 44N (Varanasi), for areas and buffers in metres
EXTENSIONS = {".geojson", ".json", ".kml", ".kmz", ".zip", ".gpkg", ".gml"}
AREA_ID = re.compile(r"^[0-9a-f]{12}$")


def _read(path: Path, suffix: str) -> gpd.GeoDataFrame:
    if suffix in (".zip", ".kmz"):
        with zipfile.ZipFile(path) as z:
            names = [n for n in z.namelist() if not n.startswith("__MACOSX")]
        wanted = (".kml",) if suffix == ".kmz" else (".shp", ".gpkg", ".geojson", ".json", ".kml")
        inner = next((n for n in names if n.lower().endswith(wanted)), None)
        if not inner:
            raise ValueError("The archive has no .shp, .gpkg, .geojson or .kml file")
        return gpd.read_file(f"/vsizip/{path}/{inner}")  # read inside the archive, nothing is extracted
    return gpd.read_file(path)


def save_upload(filename: str, data: bytes) -> dict:
    """Parses an uploaded vector file and stores it as an area; returns its metadata (+ outline GeoJSON)."""
    suffix = Path(filename or "").suffix.lower()
    if suffix not in EXTENSIONS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Unsupported file type {suffix or '(none)'}; use GeoJSON, KML/KMZ, zipped shapefile, GeoPackage or GML")
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"File larger than {MAX_UPLOAD_MB} MB")
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f"upload{suffix}"
        path.write_bytes(data)
        try:
            gdf = _read(path, suffix)
        except Exception as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Could not read the vector file: {e}") from e
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty]
    if gdf.empty:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The file has no geometries")
    if gdf.crs is None:
        gdf = gdf.set_crs(4326)  # GeoJSON / KML without a CRS are WGS84 by definition

    metric = gdf.to_crs(METRIC_CRS)
    kinds = sorted(set(metric.geom_type))
    polys = metric[metric.geom_type.isin(["Polygon", "MultiPolygon"])].geometry
    others = metric[~metric.geom_type.isin(["Polygon", "MultiPolygon"])].geometry.buffer(BUFFER_M)
    merged = shapely.make_valid(shapely.union_all(list(polys) + list(others)))
    merged = shapely.unary_union([g for g in getattr(merged, "geoms", [merged]) if g.geom_type in ("Polygon", "MultiPolygon")])
    if merged.is_empty:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No usable area in the file")
    area_ha = merged.area / 1e4
    geom = gpd.GeoSeries([merged], crs=METRIC_CRS).to_crs(4326).iloc[0]

    minx, miny, maxx, maxy = geom.bounds
    district = shapely.union_all(list(factors._village_shapes().values()))
    meta = {
        "id": uuid.uuid4().hex[:12],
        "name": Path(filename).stem.replace("_", " ").strip()[:80] or "area",
        "features": int(len(gdf)),
        "geometry_types": kinds,
        "buffered_m": BUFFER_M if not others.empty else None,
        "area_ha": round(area_ha, 1),
        "bbox": [round(v, 6) for v in (minx, miny, maxx, maxy)],
        "inside_district_pct": round(100 * geom.intersection(district).area / geom.area, 1) if geom.area else 0,
    }
    AREA_DIR.mkdir(parents=True, exist_ok=True)
    (AREA_DIR / f"{meta['id']}.geojson").write_text(json.dumps(
        {"type": "Feature", "properties": meta, "geometry": mapping(geom)}))
    return {**meta, "outline": outline_geojson(geom)}


@lru_cache(maxsize=32)
def get_area(area_id: str) -> tuple[dict, object]:
    """(metadata, WGS84 geometry) of a stored area."""
    path = AREA_DIR / f"{area_id}.geojson"
    if not AREA_ID.match(area_id or "") or not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Uploaded area not found; upload the file again")
    feature = json.loads(path.read_text())
    return feature["properties"], shape(feature["geometry"])


def outline_geojson(geom, max_points: int = 4000) -> dict:
    """Simplified outline for drawing on the map."""
    tol, g = 0.0, geom
    while shapely.get_num_coordinates(g) > max_points:
        tol = tol * 2 or 0.0001
        g = geom.simplify(tol, preserve_topology=True)
    return {"type": "Feature", "properties": {}, "geometry": mapping(g)}


def clip_wkt(geom, max_chars: int = 3500) -> str:
    """EWKT short enough for GeoServer's WMS `clip` parameter (it travels in the tile URL). The SRID matters: Leaflet
    requests tiles in EPSG:3857, and GeoServer reads an untagged clip geometry in the request's CRS."""
    tol, g = 0.0, geom
    while True:
        wkt = shapely.to_wkt(g, rounding_precision=5)
        if len(wkt) <= max_chars or tol > 0.05:
            return f"SRID=4326;{wkt}"
        tol = tol * 2 or 0.0002
        g = geom.simplify(tol, preserve_topology=True).buffer(tol)  # buffer: never clip away part of the area


def village_shares(geom) -> dict[str, float]:
    """Share (0-1) of each overlapping village's boundary that lies inside the area."""
    out = {}
    shapely.prepare(geom)  # in place: speeds up the many intersects() calls
    for code, village in factors._village_shapes().items():
        if not shapely.intersects(geom, village):
            continue
        share = shapely.intersection(geom, village).area / village.area if village.area else 0
        if share > 0.001:
            out[code] = min(1.0, share)
    return out
