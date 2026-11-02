# Dissolves the khasra parcels in varanasi.gpkg into one boundary per village (WGS84 GeoJSON), used by the
# Carbon Lab map, the per-village raster statistics and the emission rasters in place of the census boundaries.
# Usage (from fast_backend/): python -m script.cadastral_boundaries
import json
import sys
import time

import numpy as np
import pyogrio
import shapely
from pyproj import Transformer

from app.conf.logging.applog import logger
from app.conf.settings import settings

CLOSE_GAPS_M = 2.0   # buffer out and back in so slivers between neighbouring parcels do not become holes
SIMPLIFY_M = 3.0


def build() -> int:
    df = pyogrio.read_dataframe(settings.PARCELS_GPKG_PATH, columns=["vill_code", "village", "area_m2"])
    to_wgs84 = Transformer.from_crs(32644, 4326, always_xy=True)
    features = []
    for code, group in df.groupby("vill_code"):
        geoms = np.array(group.geometry.values)
        merged = shapely.union_all(shapely.buffer(geoms, CLOSE_GAPS_M)).buffer(-CLOSE_GAPS_M)
        merged = shapely.simplify(merged, SIMPLIFY_M, preserve_topology=True)
        if merged.is_empty:
            continue
        lonlat = shapely.transform(merged, lambda xy: np.column_stack(to_wgs84.transform(xy[:, 0], xy[:, 1])))
        features.append({
            "type": "Feature",
            "properties": {
                "village_code": str(code).strip(), "village_name": str(group["village"].iloc[0]),
                "parcels": int(len(group)), "area_ha": round(float(merged.area) / 1e4, 2), "source": "cadastral",
            },
            "geometry": json.loads(shapely.to_geojson(shapely.set_precision(lonlat, 1e-6))),
        })
    out = settings.CADASTRAL_BOUNDARIES_PATH
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    return len(features)


def main():
    if not settings.PARCELS_GPKG_PATH.exists():
        logger.info("Cadastral boundaries: %s not found, skipping", settings.PARCELS_GPKG_PATH)
        return 0
    t = time.monotonic()
    n = build()
    logger.info("Cadastral boundaries: %d villages written to %s in %.0f s", n, settings.CADASTRAL_BOUNDARIES_PATH, time.monotonic() - t)
    return 0


if __name__ == "__main__":
    sys.exit(main())
