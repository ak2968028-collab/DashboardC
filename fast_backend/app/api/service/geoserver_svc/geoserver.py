# ====================================================================
# app/api/service/geoserver_svc/geoserver.py
# Publishes PostGIS vector layers, GeoPackage/GeoJSON files and GeoTIFF rasters to GeoServer (REST API)
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
    # All-India census villages, loaded by media/scripts/boundaries/india_layers.py
    'india_villages': ('India Villages (Census 2011, Survey of India) - zoom in', 'india_villages'),
    # India state boundaries (media/basemap/State.shp), always shown over the base map on every dashboard map
    'india_states': ('India State Boundaries', 'india_states'),
}

# Files the API also reads straight from disk (3D view, raster statistics), published so the website's maps load
# them from GeoServer. Each becomes its own GeoPackage datastore in WORKSPACE.
# layer: (source file, layer name inside it or None for a GeoJSON file, title, style in media/geoserver)
# (Cadastral village boundaries are no longer published: census boundaries are used everywhere.)
FILE_LAYERS = {
    'khasra_parcels': (settings.PARCELS_GPKG_PATH, 'varanasi', 'Varanasi Khasra (Cadastral) Parcels', 'khasra_parcels'),
}

# Coordinate decimals in WFS output (GeoServer's default of 4 is ~11 m; 6 is ~0.1 m, as in the source files).
NUM_DECIMALS = 6

# Elevation model, published in WORKSPACE (not the raster-factor workspaces: it is EPSG:3395, not lon/lat).
DEM_LAYER = 'up_dem'


class GeoServerError(RuntimeError):
    pass


def _send(method, url, body=None, content_type='application/json', timeout=30):
    """Authenticated call to GeoServer; returns (status, body). 404 is returned, other errors raised."""
    if isinstance(body, (dict, list)):
        body = json.dumps(body).encode()
    credentials = f"{settings.GEOSERVER_USERNAME}:{settings.GEOSERVER_PASSWORD}".encode()
    req = urllib.request.Request(
        url,
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
            return res.status, res.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return 404, b""
        raise GeoServerError(f"GeoServer {method} {url} failed: {e.code} {e.read().decode(errors='replace')[:300]}")


def _request(method, path, body=None, content_type='application/json', timeout=30):
    """Calls the GeoServer REST API; returns the HTTP status (404 is returned, not raised)."""
    return _send(method, f"{settings.GEOSERVER_URL}/rest{path}", body, content_type, timeout)[0]


def rest_get(path, timeout=30):
    """GET from the REST API: parsed JSON for .json paths, raw bytes otherwise; None when not found."""
    status, body = _send('GET', f"{settings.GEOSERVER_URL}/rest{path}", timeout=timeout)
    if status == 404:
        return None
    return json.loads(body) if path.split('?')[0].endswith('.json') else body


def ows_get(path, timeout=60):
    """GET an OGC service URL (e.g. /wcs?...) relative to GEOSERVER_URL; returns the raw body."""
    return _send('GET', f"{settings.GEOSERVER_URL}{path}", timeout=timeout)[1]


def _ensure(path, create_path, body):
    """Creates a GeoServer resource unless it already exists."""
    if _request('GET', path) == 404:
        _request('POST', create_path, body)


def _ensure_workspace(workspace):
    _ensure(f"/workspaces/{workspace}", "/workspaces", {'workspace': {'name': workspace}})


def _publish_style(style, sld_path=None, workspace=WORKSPACE, sld=None):
    """Uploads an SLD (bytes, or a file defaulting to media/geoserver/<style>.sld), creating or updating the workspace style."""
    sld = sld or (sld_path or settings.SLD_DIR / f"{style}.sld").read_bytes()
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
            {'featureType': {'name': name, 'nativeName': name, 'title': title, 'srs': 'EPSG:4326',
                             'numDecimals': NUM_DECIMALS}},
        )
        _request('PUT', f"/workspaces/{WORKSPACE}/datastores/{DATASTORE}/featuretypes/{name}",
                 {'featureType': {'numDecimals': NUM_DECIMALS}})
        if style:
            _publish_style(style)
            _request('PUT', f"/layers/{WORKSPACE}:{name}",
                     {'layer': {'defaultStyle': {'name': style, 'workspace': WORKSPACE}}})


def _geopackage_bytes(path, layer):
    """The file as GeoPackage bytes: a .gpkg as-is, anything else (GeoJSON) converted into a layer named `layer`."""
    if path.suffix == '.gpkg':
        return path.read_bytes()
    import tempfile
    from pathlib import Path

    import pyogrio
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / f"{layer}.gpkg"
        pyogrio.write_dataframe(pyogrio.read_dataframe(path), out, layer=layer, driver='GPKG')
        return out.read_bytes()


def publish_file_layer(name, replace=False):
    """
    Uploads one FILE_LAYERS entry as a GeoPackage datastore + layer named `name`, then applies its style.
    Existing stores are kept unless replace=True. Returns True when the file was uploaded.
    """
    path, native, title, style = FILE_LAYERS[name]
    if not path.exists():
        raise FileNotFoundError(path)
    store = f"/workspaces/{WORKSPACE}/datastores/{name}"
    _ensure_workspace(WORKSPACE)
    exists = _request('GET', store) != 404
    if exists and replace:
        _request('DELETE', f"{store}?recurse=true")
    uploaded = replace or not exists
    if uploaded:
        _request('PUT', f"{store}/file.gpkg?configure=none", _geopackage_bytes(path, name),
                 content_type='application/geopackage+sqlite3', timeout=900)
    _ensure(f"{store}/featuretypes/{name}", f"{store}/featuretypes",
            {'featureType': {'name': name, 'nativeName': native or name, 'title': title, 'numDecimals': NUM_DECIMALS}})
    _request('PUT', f"{store}/featuretypes/{name}", {'featureType': {'numDecimals': NUM_DECIMALS}})
    _publish_style(style)
    _request('PUT', f"/layers/{WORKSPACE}:{name}", {'layer': {'defaultStyle': {'name': style, 'workspace': WORKSPACE}}})
    return uploaded


def publish_dem(replace=False):
    """Uploads the DEM GeoTIFF as WORKSPACE:up_dem with media/geoserver/up_dem.sld. True when uploaded."""
    return publish_raster(settings.DEM_TIF_PATH, settings.SLD_DIR / f"{DEM_LAYER}.sld", replace=replace,
                          workspace=WORKSPACE, name=DEM_LAYER)


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


def publish_raster(tif_path, sld_path=None, replace=False, workspace=RASTER_WORKSPACE, name=None):
    """
    Uploads a GeoTIFF as a coverage store + layer (named after the file unless `name` is given), then applies its
    SLD style. Existing rasters are kept unless replace=True. Returns True when the file was uploaded.
    """
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
    if sld_path:
        _publish_style(name, sld_path, workspace=workspace)
        _request('PUT', f"/layers/{workspace}:{name}",
                 {'layer': {'defaultStyle': {'name': name, 'workspace': workspace}}})
    return uploaded
