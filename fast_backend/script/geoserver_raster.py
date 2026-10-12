# Publishes every GeoTIFF in media/Rasters/files/<group>/ to GeoServer (workspace varanasi_raster),
# styled with media/Rasters/SLD/<group>/<same name>.sld when present.
# Usage (from fast_backend/): python -m script.geoserver_raster [--replace]
import sys
import time
import urllib.error

from app.api.service.geoserver_svc.geoserver import RASTER_WORKSPACE, GeoServerError, find_rasters, publish_raster
from app.conf.logging.applog import logger
from app.conf.settings import settings


def publish_all(replace=False):
    for tif, sld in find_rasters():
        uploaded = publish_raster(tif, sld, replace=replace)
        logger.info("GeoServer raster: %s:%s %s%s", RASTER_WORKSPACE, tif.stem,
                    "uploaded" if uploaded else "already published", "" if sld else " (no SLD found, default style)")


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
