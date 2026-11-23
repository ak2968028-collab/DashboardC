# ====================================================================
# app/api/service/geoserver_svc/geoserver.py
# GeoServer client (REST + OGC services) used by the API at runtime: listing layers, reading rasters (WCS / WMS),
# and publishing what users create on the site (uploaded factor rasters, regenerated emission rasters).
# Loading the source data from media/ into GeoServer is done by the scripts in fast_backend/script/.
# ====================================================================
import base64
import json
import urllib.error
import urllib.request

from app.conf.settings import settings

WORKSPACE = settings.GEOSERVER_WORKSPACE
DATASTORE = settings.GEOSERVER_DATASTORE
RASTER_WORKSPACE = settings.GEOSERVER_RASTER_WORKSPACE

# Elevation model layer (published by script/geoserver_raster.py in WORKSPACE: it is EPSG:3395, not lon/lat).
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


def _publish_style(style, workspace=WORKSPACE, sld=b""):
    """Uploads SLD bytes as a workspace style, creating or updating it."""
    path = f"/workspaces/{workspace}/styles"
    if _request('GET', f"{path}/{style}") == 404:
        _request('POST', f"{path}?name={style}", sld, content_type='application/vnd.ogc.sld+xml')
    else:
        _request('PUT', f"{path}/{style}", sld, content_type='application/vnd.ogc.sld+xml')
