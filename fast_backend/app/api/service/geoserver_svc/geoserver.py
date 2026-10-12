# ====================================================================
# app/api/service/geoserver_svc/geoserver.py
# Publishes PostGIS vector layers and GeoTIFF rasters to GeoServer (REST API)
# ====================================================================
import base64
import json
import urllib.error
import urllib.request

from app.conf.settings import settings

WORKSPACE = settings.GEOSERVER_WORKSPACE
DATASTORE = settings.GEOSERVER_DATASTORE
RASTER_WORKSPACE = settings.GEOSERVER_RASTER_WORKSPACE

# layer: (title, default SLD style in media/geoserver, or None for GeoServer's default)
LAYERS = {
    'villages_carbon': ('Varanasi Villages — Activity Data & GHG Emissions', 'varanasi_carbon'),
    'village_boundaries': ('Varanasi Village Boundaries', None),
    'block_boundaries': ('Varanasi Block Boundaries', 'varanasi_block_outline'),
    'district_boundary': ('Varanasi District Boundary', 'varanasi_district_outline'),
}


class GeoServerError(RuntimeError):
    pass


def _request(method, path, body=None, content_type='application/json', timeout=30):
    """Calls the GeoServer REST API; returns the HTTP status (404 is returned, not raised)."""
    if isinstance(body, (dict, list)):
        body = json.dumps(body).encode()
    credentials = f"{settings.GEOSERVER_USERNAME}:{settings.GEOSERVER_PASSWORD}".encode()
    req = urllib.request.Request(
        f"{settings.GEOSERVER_URL}/rest{path}",
        method=method,
        data=body,
        headers={
            'Authorization': 'Basic ' + base64.b64encode(credentials).decode(),
            'Content-Type': content_type,
            'Accept': 'application/json',
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return 404
        raise GeoServerError(f"GeoServer {method} {path} failed: {e.code} {e.read().decode(errors='replace')[:300]}")


def _ensure(path, create_path, body):
    """Creates a GeoServer resource unless it already exists."""
    if _request('GET', path) == 404:
        _request('POST', create_path, body)


def _ensure_workspace(workspace):
    _ensure(f"/workspaces/{workspace}", "/workspaces", {'workspace': {'name': workspace}})


def _publish_style(style, sld_path=None, workspace=WORKSPACE):
    """Uploads an SLD file (default media/geoserver/<style>.sld), creating or updating the workspace style."""
    sld = (sld_path or settings.SLD_DIR / f"{style}.sld").read_bytes()
    path = f"/workspaces/{workspace}/styles"
    if _request('GET', f"{path}/{style}") == 404:
        _request('POST', f"{path}?name={style}", sld, content_type='application/vnd.ogc.sld+xml')
    else:
        _request('PUT', f"{path}/{style}", sld, content_type='application/vnd.ogc.sld+xml')


def publish_layers():
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
    for name, (title, style) in LAYERS.items():
        _ensure(
            f"/workspaces/{WORKSPACE}/datastores/{DATASTORE}/featuretypes/{name}",
            f"/workspaces/{WORKSPACE}/datastores/{DATASTORE}/featuretypes",
            {'featureType': {'name': name, 'nativeName': name, 'title': title, 'srs': 'EPSG:4326'}},
        )
        if style:
            _publish_style(style)
            _request('PUT', f"/layers/{WORKSPACE}:{name}",
                     {'layer': {'defaultStyle': {'name': style, 'workspace': WORKSPACE}}})


ACRONYMS = {'lulc', 'gwpz', 'mar', 'ndvi', 'tpi', 'stp'}


def raster_title(name):
    """lulc_gwpz -> 'LULC GWPZ', population -> 'Population'"""
    return ' '.join(w.upper() if w in ACRONYMS else w.capitalize() for w in name.split('_'))


def find_rasters():
    """(tif, matching SLD or None) for every GeoTIFF in media/Rasters/files/<group>/."""
    files_dir = settings.RASTER_DIR / "files"
    sld_dir = settings.RASTER_DIR / "SLD"
    rasters = []
    for tif in sorted(files_dir.rglob("*.tif")):
        sld = sld_dir / tif.parent.relative_to(files_dir) / f"{tif.stem}.sld"
        rasters.append((tif, sld if sld.exists() else None))
    return rasters


def publish_raster(tif_path, sld_path=None, replace=False):
    """
    Uploads a GeoTIFF as a coverage store + layer named after the file, then applies its SLD style.
    Existing rasters are kept unless replace=True. Returns True when the file was uploaded.
    """
    name = tif_path.stem
    store = f"/workspaces/{RASTER_WORKSPACE}/coveragestores/{name}"
    _ensure_workspace(RASTER_WORKSPACE)
    exists = _request('GET', store) != 404
    if exists and replace:
        _request('DELETE', f"{store}?recurse=true&purge=all")
    uploaded = replace or not exists
    if uploaded:
        _request('PUT', f"{store}/file.geotiff?configure=first&coverageName={name}",
                 tif_path.read_bytes(), content_type='image/tiff', timeout=300)
    if sld_path:
        _publish_style(name, sld_path, workspace=RASTER_WORKSPACE)
        _request('PUT', f"/layers/{RASTER_WORKSPACE}:{name}",
                 {'layer': {'defaultStyle': {'name': name, 'workspace': RASTER_WORKSPACE}}})
    return uploaded
