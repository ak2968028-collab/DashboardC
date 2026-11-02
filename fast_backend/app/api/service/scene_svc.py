"""Village layout for the Carbon Lab 3D view, built from the cadastral (khasra) parcels in varanasi.gpkg.

Land use comes from the LULC raster: every parcel takes the LULC pixels whose centres fall inside it and is
classed by the dominant cover. Houses are placed on the built-up pixels themselves, so hamlets show where they
really are; pasture goes to rangeland (else nearby cropland), the dump to bare ground and trees to tree pixels.
Villages outside the LULC extent fall back to an estimate: the parcels closest to the densest cluster of small
parcels are taken as built-up until they cover the village's surveyed built-up area."""
from functools import lru_cache

import numpy as np
import pyogrio
import shapely
from fastapi import HTTPException, status
from fastapi.concurrency import run_in_threadpool
from pyproj import Transformer
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.service.geoserver_svc import emission_rasters
from app.api.service.village_svc import village_svc
from app.conf.settings import settings

PARCEL_LAYER = "varanasi"
SIMPLIFY_M = 1.0
NEIGHBOUR_M = 100.0     # radius for the parcel-density count that locates the settlement core (fallback)
MAX_HOUSES = 150        # house markers drawn; each stands for several households in big villages
PASTURE_HA = 3.0        # grazing ground taken from the land nearest the settlement
N_TREES = 24
LULC_MIN_COVER = 0.5    # share of the village area the LULC must cover before it is used
BUILTUP_SHARE = 0.5     # parcels at least this built-up (by LULC pixels) form the settlement

# LULC legend label -> parcel use drawn by the 3D view
USE_BY_LABEL = {
    "Builtup Area": "builtup", "Cropland": "cropland", "Trees": "trees", "Water": "water",
    "Rangeland": "rangeland", "Bare Ground": "bare",
}
_TO_UTM = Transformer.from_crs(4326, 32644, always_xy=True)
_TO_LONLAT = Transformer.from_crs(32644, 4326, always_xy=True)


@lru_cache(maxsize=32)
def _read_parcels(village_code: str):
    path = settings.PARCELS_GPKG_PATH
    if not path.exists():
        return None
    return pyogrio.read_dataframe(path, layer=PARCEL_LAYER, where=f"vill_code = '{village_code}'", columns=["khasra", "area_m2"])


@lru_cache(maxsize=1)
def _lulc_grid():
    return emission_rasters._lulc()


def _largest_part(geom):
    return max(geom.geoms, key=lambda p: p.area) if geom.geom_type == "MultiPolygon" else geom


def _spread(cand: np.ndarray, n: int, spacing: float) -> np.ndarray:
    """Up to n of the candidate points, kept at least `spacing` apart where possible."""
    picked: list[np.ndarray] = []
    for gap in (spacing, spacing / 2, 0.0):
        for p in cand:
            if len(picked) >= n:
                break
            if not picked or np.min(np.hypot(*(np.array(picked) - p).T)) >= gap:
                picked.append(p)
        if len(picked) >= n:
            break
    return np.array(picked) if picked else np.empty((0, 2))


def _sample_points(area, n: int, spacing: float, rng: np.random.Generator) -> np.ndarray:
    """Up to n random points inside `area`, kept at least `spacing` apart where possible."""
    if n <= 0 or area.is_empty:
        return np.empty((0, 2))
    shapely.prepare(area)
    minx, miny, maxx, maxy = area.bounds
    cand = rng.uniform([minx, miny], [maxx, maxy], size=(max(n * 40, 400), 2))
    return _spread(cand[shapely.contains_xy(area, cand[:, 0], cand[:, 1])], n, spacing)


def _ring(geom, ox: float, oy: float) -> list[tuple[float, float]]:
    return [(round(x - ox, 1), round(y - oy, 1)) for x, y in geom.exterior.coords[:-1]]


def _landcover(polys: np.ndarray):
    """LULC pixels inside the parcels: (per-parcel pixel counts by class, class labels, pixel xy in UTM,
    pixel class labels, pixel area m²), or None when the LULC does not cover the village."""
    codes, x0, y0, px, labels, nodata = _lulc_grid()
    minx, miny, maxx, maxy = shapely.total_bounds(polys)
    lon, lat = _TO_LONLAT.transform([minx, maxx, minx, maxx], [miny, miny, maxy, maxy])
    h, w = codes.shape
    c0, c1 = max(0, int((min(lon) - x0) / px) - 1), min(w, int((max(lon) - x0) / px) + 2)
    r0, r1 = max(0, int((y0 - max(lat)) / px) - 1), min(h, int((y0 - min(lat)) / px) + 2)
    if c0 >= c1 or r0 >= r1:
        return None
    sub = codes[r0:r1, c0:c1]
    cols, rows = np.meshgrid(np.arange(c0, c1), np.arange(r0, r1))
    ok = sub != nodata
    if not ok.any():
        return None
    ux, uy = _TO_UTM.transform(x0 + (cols[ok] + 0.5) * px, y0 - (rows[ok] + 0.5) * px)
    pixel_cls = sub[ok]
    point_idx, parcel_idx = shapely.STRtree(polys).query(shapely.points(ux, uy), predicate="within")

    label_codes = sorted(labels)
    k_of = {c: i for i, c in enumerate(label_codes)}
    counts = np.zeros((len(polys), len(label_codes)))
    known = np.isin(pixel_cls[point_idx], label_codes)
    np.add.at(counts, (parcel_idx[known], [k_of[c] for c in pixel_cls[point_idx][known]]), 1)

    # Parcels too small to hold a pixel centre take the pixel under their own centre.
    for i in np.flatnonzero(counts.sum(axis=1) == 0):
        cx, cy = shapely.get_coordinates(shapely.point_on_surface(polys[i]))[0]
        plon, plat = _TO_LONLAT.transform(cx, cy)
        c, r = int((plon - x0) / px), int((y0 - plat) / px)
        if 0 <= r < h and 0 <= c < w and codes[r, c] in k_of:
            counts[i, k_of[codes[r, c]]] = 1

    areas = shapely.area(polys)
    if areas[counts.sum(axis=1) > 0].sum() < LULC_MIN_COVER * areas.sum():
        return None
    pixel_m2 = (px * 111_320 * np.cos(np.radians(np.mean(lat)))) * (px * 110_574)
    inside = np.unique(point_idx)
    return (counts, [labels[c] for c in label_codes], np.column_stack([ux, uy])[inside],
            np.array([labels.get(c, "") for c in pixel_cls[inside]]), pixel_m2)


@lru_cache(maxsize=64)
def build_scene(village_code: str, households: int, builtup_ha: float) -> dict | None:
    df = _read_parcels(village_code)
    if df is None or df.empty:
        return None
    rng = np.random.default_rng(int(village_code))
    polys = shapely.simplify(np.array([_largest_part(g) for g in df.geometry]), SIMPLIFY_M, preserve_topology=True)
    keep = ~shapely.is_empty(polys) & (shapely.area(polys) > 0)
    polys, khasra = polys[keep], df["khasra"].to_numpy()[keep]
    areas = shapely.area(polys)
    minx, miny, maxx, maxy = shapely.total_bounds(polys)
    ox, oy = (minx + maxx) / 2, (miny + maxy) / 2
    xy = shapely.get_coordinates(shapely.centroid(polys))
    n_houses_wanted = min(MAX_HOUSES, households) if households > 0 else 0

    lc = _landcover(polys)
    landcover: dict[str, float] = {}
    if lc:
        counts, class_labels, pix_xy, pix_label, pixel_m2 = lc
        landcover_source = "LULC raster (lulc_priority)"
        dominant = np.array([class_labels[k] for k in counts.argmax(axis=1)])
        uses = np.array([USE_BY_LABEL.get(lab, "land") for lab in dominant])
        uses[counts.sum(axis=1) == 0] = "land"
        b = class_labels.index("Builtup Area") if "Builtup Area" in class_labels else None
        share = counts[:, b] / np.maximum(counts.sum(axis=1), 1) if b is not None else np.zeros(len(polys))
        built = share >= BUILTUP_SHARE
        if not built.any() and share.max() > 0:
            built[share.argmax()] = True
        uses[built] = "builtup"
        for lab in class_labels:
            ha = round(float((pix_label == lab).sum() * pixel_m2 / 1e4), 2)
            if ha > 0:
                landcover[USE_BY_LABEL.get(lab, lab)] = ha
        builtup_m2 = landcover.get("builtup", 0) * 1e4

        # Houses on the built-up pixels themselves (jittered within the pixel), spread evenly.
        bp = pix_xy[pix_label == "Builtup Area"]
        n_houses = n_houses_wanted or min(MAX_HOUSES, len(bp))
        half = np.sqrt(pixel_m2) / 2
        cand = np.repeat(bp, 4, axis=0) + rng.uniform(-half, half, size=(len(bp) * 4, 2))
        rng.shuffle(cand)
        spacing = 0.6 * np.sqrt(max(builtup_m2, 1) / max(n_houses, 1))
        houses = _spread(cand, n_houses, spacing)
        tree_pix = pix_xy[pix_label == "Trees"]
    else:
        landcover_source = "Estimated from parcel density (no LULC coverage)"
        cents = shapely.centroid(polys)
        pairs = shapely.STRtree(cents).query(cents, predicate="dwithin", distance=NEIGHBOUR_M)
        core0 = xy[np.bincount(pairs[0], minlength=len(cents)).argmax()]
        order0 = np.argsort(np.hypot(*(xy - core0).T))
        target = builtup_ha * 1e4 if builtup_ha > 0 else max(households * 120.0, 0.03 * areas.sum())
        n_built = int(min(len(polys), np.searchsorted(np.cumsum(areas[order0]), target) + 1))
        built = np.zeros(len(polys), bool)
        built[order0[:n_built]] = True
        uses = np.where(built, "builtup", "land")
        settlement0 = shapely.union_all(shapely.buffer(polys[built], 0.5))
        n_houses = n_houses_wanted or min(MAX_HOUSES, n_built * 3)
        spacing = 0.6 * np.sqrt(settlement0.area / max(n_houses, 1))
        houses = _sample_points(settlement0, n_houses, spacing, rng)
        builtup_m2 = float(areas[built].sum())
        tree_pix = np.empty((0, 2))

    core = houses.mean(axis=0) if len(houses) else xy[built].mean(axis=0) if built.any() else np.array([ox, oy])
    order = np.argsort(np.hypot(*(xy - core).T))
    open_land = [i for i in order if not built[i] and uses[i] != "water"]

    # Village road: a loop hugging the houses.
    if len(houses) >= 3:
        hull = shapely.concave_hull(shapely.multipoints(houses), ratio=0.4)
    else:
        hull = shapely.union_all(polys[built]) if built.any() else shapely.Point(core)
    route = shapely.simplify(_largest_part(hull.buffer(max(15.0, spacing * 1.5))), 5.0)

    # Grazing ground: rangeland first, then the open land nearest the settlement.
    grazing = [i for i in open_land if uses[i] == "rangeland"] + [i for i in open_land if uses[i] != "rangeland"]
    pasture_ids = []
    for i in grazing:
        pasture_ids.append(i)
        if areas[pasture_ids].sum() >= PASTURE_HA * 1e4 or len(pasture_ids) >= 8:
            break
    pasture = _sample_points(shapely.union_all(polys[pasture_ids]), 36, 8.0, rng) if pasture_ids else houses[:1]
    rest = [i for i in open_land if i not in pasture_ids]
    bare = [i for i in rest if uses[i] == "bare"]
    dump_id = bare[0] if bare else rest[min(2, len(rest) - 1)] if rest else order[-1]
    dump = shapely.get_coordinates(shapely.point_on_surface(polys[dump_id]))[0]
    if len(tree_pix):
        trees = tree_pix[rng.choice(len(tree_pix), size=min(N_TREES, len(tree_pix)), replace=False)]
    elif rest:
        tree_ids = rng.choice(rest, size=min(N_TREES, len(rest)), replace=False, p=areas[rest] / areas[rest].sum())
        trees = shapely.get_coordinates(shapely.point_on_surface(polys[tree_ids]))
    else:
        trees = np.empty((0, 2))

    outline = shapely.union_all(shapely.buffer(polys, 3.0)).buffer(-3.0)
    outline = shapely.simplify(_largest_part(outline), 4.0)

    local = lambda pts: [(round(x - ox, 1), round(y - oy, 1)) for x, y in pts]  # noqa: E731
    return {
        "village_code": village_code,
        "source": "Cadastral khasra parcels (varanasi.gpkg, EPSG:32644)",
        "landcover_source": landcover_source,
        "landcover_ha": landcover,
        "origin": (round(ox, 1), round(oy, 1)),
        "extent_m": (round(maxx - minx, 1), round(maxy - miny, 1)),
        "parcel_count": int(len(polys)),
        "builtup_est_ha": round(builtup_m2 / 1e4, 2),
        "households_per_house": round(households / len(houses), 2) if households > 0 and len(houses) else 0.0,
        "parcels": [
            {"khasra": k, "area_m2": round(float(a), 1), "use": str(u), "ring": _ring(p, ox, oy)}
            for p, k, a, u in zip(polys, khasra, areas, uses)
        ],
        "outline": _ring(outline, ox, oy),
        "houses": local(houses),
        "route": _ring(route, ox, oy),
        "pasture": local(pasture),
        "dump": (round(dump[0] - ox, 1), round(dump[1] - oy, 1)),
        "trees": local(trees),
    }


class scene_svc:

    async def get_scene(db: AsyncSession, village_code: str):
        v = await village_svc.get_village(db, village_code)
        scene = None
        if village_code.isdigit():
            scene = await run_in_threadpool(
                build_scene, village_code, int(v["total_households"] or 0), float(v["builtup_area_ha"] or 0),
            )
        if not scene:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No cadastral parcels for village {village_code}")
        return scene
