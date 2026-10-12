# Waits for GeoServer to come up, then publishes the PostGIS layers & styles.
# Usage (from fast_backend/): python -m script.geoserver_publish
import sys
import time
import urllib.error

from app.api.service.geoserver_svc.geoserver import LAYERS, WORKSPACE, GeoServerError, publish_layers
from app.conf.logging.applog import logger
from app.conf.settings import settings


def main(timeout_s=600, interval_s=10):
    if not settings.GEOSERVER_URL:
        logger.info("GeoServer: GEOSERVER_URL not set, skipping layer publishing")
        return 0
    deadline = time.monotonic() + timeout_s
    while True:
        try:
            publish_layers()
            logger.info("GeoServer: published %d layers in workspace '%s'", len(LAYERS), WORKSPACE)
            return 0
        except (urllib.error.URLError, ConnectionError, TimeoutError, GeoServerError) as e:
            if isinstance(e, GeoServerError):
                logger.warning("GeoServer: %s (retrying)", e)
            if time.monotonic() > deadline:
                logger.error("GeoServer: giving up publishing layers: %s", e)
                return 1
            time.sleep(interval_s)


if __name__ == "__main__":
    sys.exit(main())
