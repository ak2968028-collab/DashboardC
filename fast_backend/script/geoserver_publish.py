# Publishes the vector layers to GeoServer, reading every source file and style from media/:
#   - PostGIS layers (tables filled by script/load_database.py): Varanasi villages, blocks, district, all-India villages
#   - media/Smulation data/varanasi.gpkg  -> khasra_parcels (GeoPackage store; the Carbon Lab reads it via WFS)
#   - media/basemap/State.shp             -> india_states   (shapefile store; drawn on every dashboard map)
# Styles: media/geoserver/<style>.sld. Waits for GeoServer to come up first.
# Usage (from fast_backend/): python -m script.geoserver_publish [--replace]   (--replace re-uploads the files)
import io
import sys
import time
import urllib.error
import zipfile
from pathlib import Path

from app.api.service.geoserver_svc.geoserver import (
    DATASTORE, WORKSPACE, GeoServerError, _ensure, _ensure_workspace, _publish_style, _request,
)
from app.conf.logging.applog import logger
from app.conf.settings import settings

MEDIA = Path(__file__).resolve().parents[1] / "media"
SLD_DIR = MEDIA / "geoserver"

# Coordinate decimals in WFS output (GeoServer's default of 4 is ~11 m; 6 is ~0.1 m, as in the source files).
NUM_DECIMALS = 6

# PostGIS table/view: (title, style in media/geoserver or None for GeoServer's default)
POSTGIS_LAYERS = {
    'villages_carbon': ('Varanasi Villages — Activity Data & GHG Emissions', 'varanasi_carbon'),
    'village_boundaries': ('Varanasi Village Boundaries', None),
    'block_boundaries': ('Varanasi Block Boundaries', 'varanasi_block_outline'),
    'district_boundary': ('Varanasi District Boundary', 'varanasi_district_outline'),
    'india_villages': ('India Villages (Census 2011, Survey of India) - zoom in', 'india_villages'),
}

# layer: (GeoPackage in media, layer inside it, title, style)
GEOPACKAGE_LAYERS = {
    'khasra_parcels': (MEDIA / "Smulation data" / "varanasi.gpkg", 'varanasi', 'Varanasi Khasra (Cadastral) Parcels',
                       'khasra_parcels'),
}

# layer: (shapefile in media, title, style)
SHAPEFILE_LAYERS = {
    'india_states': (MEDIA / "basemap" / "State.shp", 'India State Boundaries', 'india_states'),
}


def _style(name, style, workspace=WORKSPACE):
    _publish_style(style, workspace=workspace, sld=(SLD_DIR / f"{style}.sld").read_bytes())
    _request('PUT', f"/layers/{workspace}:{name}", {'layer': {'defaultStyle': {'name': style, 'workspace': workspace}}})


def publish_postgis_layers():
    """Idempotently creates the workspace, the PostGIS datastore, the layers and their styles."""
    _ensure_workspace(WORKSPACE)
    params = {
        'dbtype': 'postgis', 'host': settings.POSTGRES_HOST, 'port': str(settings.POSTGRES_PORT),
        'database': settings.POSTGRES_DB, 'user': settings.POSTGRES_USER, 'passwd': settings.POSTGRES_PASSWORD,
        'schema': 'public', 'Expose primary keys': 'true',
    }
    _ensure(
        f"/workspaces/{WORKSPACE}/datastores/{DATASTORE}",
        f"/workspaces/{WORKSPACE}/datastores",
        {'dataStore': {
            'name': DATASTORE,
            'description': 'Varanasi village environment & carbon database (PostGIS)',
            'connectionParameters': {'entry': [{'@key': k, '$': v} for k, v in params.items()]},
        }},
    )
    for name, (title, style) in POSTGIS_LAYERS.items():
        ft = f"/workspaces/{WORKSPACE}/datastores/{DATASTORE}/featuretypes"
        _ensure(f"{ft}/{name}", ft, {'featureType': {'name': name, 'nativeName': name, 'title': title,
                                                     'srs': 'EPSG:4326', 'numDecimals': NUM_DECIMALS}})
        _request('PUT', f"{ft}/{name}", {'featureType': {'numDecimals': NUM_DECIMALS}})
        if style:
            _style(name, style)


def _store(name, replace):
    """(store path, upload needed): drops the store first when replace=True."""
    store = f"/workspaces/{WORKSPACE}/datastores/{name}"
    _ensure_workspace(WORKSPACE)
    exists = _request('GET', store) != 404
    if exists and replace:
        _request('DELETE', f"{store}?recurse=true")
    return store, replace or not exists


def publish_geopackage(name, replace=False):
    """Uploads a GeoPackage from media as datastore + layer `name`. True when the file was uploaded."""
    path, native, title, style = GEOPACKAGE_LAYERS[name]
    if not path.exists():
        raise FileNotFoundError(path)
    store, upload = _store(name, replace)
    if upload:
        _request('PUT', f"{store}/file.gpkg?configure=none", path.read_bytes(),
                 content_type='application/geopackage+sqlite3', timeout=900)
    _ensure(f"{store}/featuretypes/{name}", f"{store}/featuretypes",
            {'featureType': {'name': name, 'nativeName': native, 'title': title, 'numDecimals': NUM_DECIMALS}})
    _request('PUT', f"{store}/featuretypes/{name}", {'featureType': {'numDecimals': NUM_DECIMALS}})
    _style(name, style)
    return upload


def publish_shapefile(name, replace=False):
    """Zips a shapefile from media (all its sidecar files, renamed to `name`) and uploads it as datastore + layer
    `name`. True when the file was uploaded."""
    path, title, style = SHAPEFILE_LAYERS[name]
    if not path.exists():
        raise FileNotFoundError(path)
    store, upload = _store(name, replace)
    if upload:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for part in sorted(path.parent.glob(f"{path.stem}.*")):
                z.write(part, f"{name}{part.suffix.lower()}")
        _request('PUT', f"{store}/file.shp?configure=all&charset=UTF-8", buf.getvalue(),
                 content_type='application/zip', timeout=900)
    _request('PUT', f"{store}/featuretypes/{name}", {'featureType': {'title': title, 'numDecimals': NUM_DECIMALS}})
    _style(name, style)
    return upload


def publish_all(replace=False):
    publish_postgis_layers()
    logger.info("GeoServer: published %d PostGIS layers in workspace '%s'", len(POSTGIS_LAYERS), WORKSPACE)
    for name in GEOPACKAGE_LAYERS:
        logger.info("GeoServer: %s:%s %s", WORKSPACE, name, "uploaded" if publish_geopackage(name, replace) else "already published")
    for name in SHAPEFILE_LAYERS:
        logger.info("GeoServer: %s:%s %s", WORKSPACE, name, "uploaded" if publish_shapefile(name, replace) else "already published")


def main(replace=False, timeout_s=600, interval_s=10):
    if not settings.GEOSERVER_URL:
        logger.info("GeoServer: GEOSERVER_URL not set, skipping layer publishing")
        return 0
    deadline = time.monotonic() + timeout_s
    while True:
        try:
            publish_all(replace)
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
