# Publishes the rasters to GeoServer, reading every GeoTIFF and style from media/:
#   - media/Rasters/files/<group>/<name>.tif  -> varanasi_raster:<name>, styled with media/Rasters/SLD/<group>/<name>.sld
#     (title and group are stored on the coverage, so the API lists rasters from GeoServer, not from media/)
#   - media/DEM/UP_DEM.tif                     -> varanasi:up_dem, styled with media/geoserver/up_dem.sld
# Usage (from fast_backend/): python -m script.geoserver_raster [--replace]
import sys
import time
import urllib.error
from pathlib import Path

from app.api.service.geoserver_svc.geoserver import (
    DEM_LAYER, RASTER_WORKSPACE, WORKSPACE, GeoServerError, _ensure_workspace, _publish_style, _request,
)
from app.conf.logging.applog import logger
from app.conf.settings import settings

MEDIA = Path(__file__).resolve().parents[1] / "media"
RASTER_FILES = MEDIA / "Rasters" / "files"
RASTER_SLD = MEDIA / "Rasters" / "SLD"
DEM_TIF = MEDIA / "DEM" / "UP_DEM.tif"
DEM_SLD = MEDIA / "geoserver" / f"{DEM_LAYER}.sld"

ACRONYMS = {'lulc', 'gwpz', 'mar', 'ndvi', 'tpi', 'stp'}


def raster_title(name):
    """lulc_gwpz -> 'LULC GWPZ', population -> 'Population'"""
    return ' '.join(w.upper() if w in ACRONYMS else w.capitalize() for w in name.split('_'))


def find_rasters():
    """(tif, matching SLD or None) for every GeoTIFF in media/Rasters/files/<group>/."""
    rasters = []
    for tif in sorted(RASTER_FILES.rglob("*.tif")):
        sld = RASTER_SLD / tif.parent.relative_to(RASTER_FILES) / f"{tif.stem}.sld"
        rasters.append((tif, sld if sld.exists() else None))
    return rasters


def publish_raster(tif_path, sld_path=None, replace=False, workspace=RASTER_WORKSPACE, name=None, title=None,
                   keywords=()):
    """Uploads a GeoTIFF as a coverage store + layer (named after the file unless `name` is given), sets its title
    and keywords, then applies its SLD. Existing rasters are kept unless replace=True. True when uploaded."""
    name = name or tif_path.stem
    store = f"/workspaces/{workspace}/coveragestores/{name}"
    _ensure_workspace(workspace)
    exists = _request('GET', store) != 404
    if exists and replace:
        _request('DELETE', f"{store}?recurse=true&purge=all")
    uploaded = replace or not exists
    if uploaded:
        _request('PUT', f"{store}/file.geotiff?configure=first&coverageName={name}",
                 tif_path.read_bytes(), content_type='image/tiff', timeout=300)
    meta = {'title': title or raster_title(name)}
    if keywords:
        meta['keywords'] = {'string': list(keywords)}
    _request('PUT', f"{store}/coverages/{name}", {'coverage': meta})
    if sld_path:
        _publish_style(name, workspace=workspace, sld=sld_path.read_bytes())
        _request('PUT', f"/layers/{workspace}:{name}",
                 {'layer': {'defaultStyle': {'name': name, 'workspace': workspace}}})
    return uploaded


def publish_all(replace=False):
    for tif, sld in find_rasters():
        uploaded = publish_raster(tif, sld, replace=replace, keywords=[f"group={tif.parent.name}"])
        logger.info("GeoServer raster: %s:%s %s%s", RASTER_WORKSPACE, tif.stem,
                    "uploaded" if uploaded else "already published", "" if sld else " (no SLD found, default style)")
    if DEM_TIF.exists():
        uploaded = publish_raster(DEM_TIF, DEM_SLD if DEM_SLD.exists() else None, replace=replace,
                                  workspace=WORKSPACE, name=DEM_LAYER, title='Elevation (DEM)')
        logger.info("GeoServer raster: %s:%s %s", WORKSPACE, DEM_LAYER, "uploaded" if uploaded else "already published")


def main(replace=False, timeout_s=600, interval_s=10):
    if not settings.GEOSERVER_URL:
        logger.info("GeoServer: GEOSERVER_URL not set, skipping raster publishing")
        return 0
    deadline = time.monotonic() + timeout_s
    while True:
        try:
            publish_all(replace)
            return 0
        except (urllib.error.URLError, ConnectionError, TimeoutError, GeoServerError) as e:
            if isinstance(e, GeoServerError):
                logger.warning("GeoServer raster: %s (retrying)", e)
            if time.monotonic() > deadline:
                logger.error("GeoServer raster: giving up: %s", e)
                return 1
            time.sleep(interval_s)


if __name__ == "__main__":
    sys.exit(main(replace="--replace" in sys.argv))
