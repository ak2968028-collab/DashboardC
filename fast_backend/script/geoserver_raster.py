# Publishes the Varanasi LULC coverage and DEM to GeoServer. The LULC is the district clip made from the 2025 44R tile;
# all Varanasi LULC consumers use the stable `varanasi_raster:lulc_priority` layer.
#   - media/DEM/UP_DEM.tif                     -> varanasi:up_dem, styled with media/geoserver/up_dem.sld
# Usage (from fast_backend/): python -m script.geoserver_raster [--replace]
import sys
import tempfile
import time
import urllib.error
from pathlib import Path

from app.api.service.geoserver_svc.geoserver import (
    DEM_LAYER, RASTER_WORKSPACE, WORKSPACE, GeoServerError, _ensure_workspace, _publish_style, _request,
)
from app.conf.logging.applog import logger
from app.conf.settings import settings

MEDIA = Path(__file__).resolve().parents[1] / "media"
LULC_SOURCE = MEDIA / "Rasters" / "44R_20250101-20251231.tif"
LULC_CUTLINE = MEDIA / "data" / "processed" / "varanasi_district.geojson"
LULC_SLD = '''<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc">
  <NamedLayer><Name>lulc_priority</Name><UserStyle><Name>lulc_priority_2025</Name><FeatureTypeStyle><Rule>
    <RasterSymbolizer><ColorMap type="values">
      <ColorMapEntry color="#419bdf" quantity="1" label="Water"/>
      <ColorMapEntry color="#397d49" quantity="2" label="Trees"/>
      <ColorMapEntry color="#7a87c6" quantity="4" label="Flooded vegetation"/>
      <ColorMapEntry color="#e49635" quantity="5" label="Cropland"/>
      <ColorMapEntry color="#c4281b" quantity="7" label="Builtup Area"/>
      <ColorMapEntry color="#a59b8f" quantity="8" label="Bare Ground"/>
      <ColorMapEntry color="#a8ebff" quantity="9" label="Snow and ice"/>
      <ColorMapEntry color="#616161" quantity="10" label="Clouds"/>
      <ColorMapEntry color="#e3e2c3" quantity="11" label="Rangeland"/>
    </ColorMap></RasterSymbolizer>
  </Rule></FeatureTypeStyle></UserStyle></NamedLayer>
</StyledLayerDescriptor>'''
DEM_TIF = MEDIA / "DEM" / "UP_DEM.tif"
DEM_SLD = MEDIA / "geoserver" / f"{DEM_LAYER}.sld"

ACRONYMS = {'lulc', 'gwpz', 'mar', 'ndvi', 'tpi', 'stp'}


def raster_title(name):
    """lulc_gwpz -> 'LULC GWPZ', population -> 'Population'"""
    return ' '.join(w.upper() if w in ACRONYMS else w.capitalize() for w in name.split('_'))


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


def build_lulc_clip(output: Path):
    """Clip the 44R 10 m class raster to Varanasi, then reproject it to WGS84 for all dashboard LULC consumers."""
    import geopandas as gpd
    import numpy as np
    import rasterio
    from pyproj import Transformer
    from rasterio.transform import array_bounds
    from rasterio.warp import Resampling, calculate_default_transform, reproject
    from rasterio.windows import from_bounds
    from shapely.ops import transform as transform_geometry, unary_union

    boundaries = gpd.read_file(LULC_CUTLINE)
    if boundaries.empty:
        raise ValueError(f"No district geometry in {LULC_CUTLINE}")
    district = unary_union(boundaries.geometry)
    to_source = Transformer.from_crs(boundaries.crs or "EPSG:4326", "EPSG:32644", always_xy=True)
    district_utm = transform_geometry(to_source.transform, district)

    with rasterio.open(LULC_SOURCE) as src:
        if src.crs.to_epsg() != 32644 or src.count != 1:
            raise ValueError(f"Expected a single-band EPSG:32644 LULC source, got {src.crs} / {src.count} bands")
        window = from_bounds(*district_utm.bounds, transform=src.transform).round_offsets().round_lengths()
        window = window.intersection(rasterio.windows.Window(0, 0, src.width, src.height))
        if not window.width or not window.height:
            raise ValueError("The Varanasi boundary does not intersect the 44R LULC tile")
        source = src.read(1, window=window)
        source_transform = src.window_transform(window)
        # Mask to the exact district outline, retaining 0 as the source nodata code.
        from rasterio.features import geometry_mask
        inside = geometry_mask([district_utm.__geo_interface__], out_shape=source.shape,
                               transform=source_transform, invert=True)
        source = np.where(inside, source, 0).astype(np.uint8)
        left, bottom, right, top = array_bounds(source.shape[0], source.shape[1], source_transform)

        dst_crs = "EPSG:4326"
        dst_transform, width, height = calculate_default_transform(
            src.crs, dst_crs, source.shape[1], source.shape[0], left, bottom, right, top,
            resolution=(0.0001, 0.0001))
        dest = np.zeros((height, width), dtype=np.uint8)
        reproject(source=source, destination=dest, src_transform=source_transform, src_crs=src.crs,
                  src_nodata=0, dst_transform=dst_transform, dst_crs=dst_crs, dst_nodata=0,
                  resampling=Resampling.nearest)
        profile = {"driver": "GTiff", "width": width, "height": height, "count": 1, "dtype": "uint8",
                   "crs": dst_crs, "transform": dst_transform, "nodata": 0, "tiled": True,
                   "compress": "LZW", "predictor": 2, "blockxsize": 256, "blockysize": 256}
        with rasterio.open(output, "w", **profile) as dst:
            dst.write(dest, 1)
            dst.write_colormap(1, src.colormap(1))


def publish_all(replace=False):
    if not LULC_SOURCE.exists() or not LULC_CUTLINE.exists():
        raise FileNotFoundError(f"Missing LULC source {LULC_SOURCE} or district boundary {LULC_CUTLINE}")
    with tempfile.TemporaryDirectory(prefix="varanasi-lulc-") as tmp:
        tif = Path(tmp) / "lulc_priority_2025.tif"
        sld = Path(tmp) / "lulc_priority_2025.sld"
        build_lulc_clip(tif)
        sld.write_text(LULC_SLD, encoding="utf-8")
        uploaded = publish_raster(tif, sld, replace=True, workspace=RASTER_WORKSPACE,
                                  name="lulc_priority", title="LULC 2025",
                                  keywords=["group=landcover", "source=44R_20250101-20251231", "year=2025"])
        logger.info("GeoServer raster: %s:lulc_priority %s (built from 2025 44R LULC)", RASTER_WORKSPACE,
                    "uploaded" if uploaded else "already published")
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
