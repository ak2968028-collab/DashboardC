# Builds the carbon emission rasters from the village inventory (spread over LULC land cover) and publishes them
# to GeoServer (workspace varanasi_emission).
# Usage (from fast_backend/): python -m script.emission_rasters
import asyncio
import sys

from app.api.service.geoserver_svc import emission_rasters
from app.conf.logging.applog import logger
from app.conf.settings import settings
from app.database.config.session import AsyncSessionLocal, engine


async def run():
    async with AsyncSessionLocal() as db:
        report = await emission_rasters.regenerate(db)
    await engine.dispose()
    return report


def main():
    if not settings.GEOSERVER_URL:
        logger.info("Emission rasters: GEOSERVER_URL not set, skipping")
        return 0
    report = asyncio.run(run())
    logger.info("Emission rasters: %s", report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
