# Waits for GeoServer to come up, then publishes the PostGIS layers (Varanasi villages, blocks and district, and the
# all-India census villages, rivers and catchments) and the khasra parcels (varanasi.gpkg), with their styles.
# Usage (from fast_backend/): python -m script.geoserver_publish [--replace]   (--replace re-uploads the files)
import sys
import time
import urllib.error

from app.api.service.geoserver_svc.geoserver import (
    FILE_LAYERS, LAYERS, WORKSPACE, GeoServerError, publish_file_layer, publish_layers,
)
from app.conf.logging.applog import logger
from app.conf.settings import settings


def main(replace=False, timeout_s=600, interval_s=10):
    if not settings.GEOSERVER_URL:
        logger.info("GeoServer: GEOSERVER_URL not set, skipping layer publishing")
        return 0
    deadline = time.monotonic() + timeout_s
    while True:
        try:
            publish_layers()
            logger.info("GeoServer: published %d layers in workspace '%s'", len(LAYERS), WORKSPACE)
            for name in FILE_LAYERS:
                uploaded = publish_file_layer(name, replace=replace)
                logger.info("GeoServer: %s:%s %s", WORKSPACE, name, "uploaded" if uploaded else "already published")
            return 0
        except (urllib.error.URLError, ConnectionError, TimeoutError, GeoServerError) as e:
            if isinstance(e, GeoServerError):
                logger.warning("GeoServer: %s (retrying)", e)
            if time.monotonic() > deadline:
                logger.error("GeoServer: giving up publishing layers: %s", e)
                return 1
            time.sleep(interval_s)


if __name__ == "__main__":
    sys.exit(main(replace="--replace" in sys.argv))
