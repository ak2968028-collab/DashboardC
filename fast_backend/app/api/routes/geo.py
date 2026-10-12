from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from app.api.schema.geo_schema import Raster_layer
from app.api.service.geoserver_svc.geoserver import RASTER_WORKSPACE, find_rasters, raster_title
from app.conf.settings import settings

router = APIRouter()


@router.get("/rasters", response_model=list[Raster_layer])
async def get_raster_layers():
    """Raster layers published on GeoServer (WMS), as uploaded by script/geoserver_raster.py."""
    return [
        {
            'name': tif.stem,
            'title': raster_title(tif.stem),
            'group': tif.parent.name,
            'workspace': RASTER_WORKSPACE,
            'layer': f"{RASTER_WORKSPACE}:{tif.stem}",
        }
        for tif, _ in find_rasters()
    ]


@router.get("/{layer}")
async def get_geojson_layer(layer: str):
    """Boundary GeoJSON: district, blocks or villages."""
    path = settings.GEOJSON_LAYERS.get(layer)
    if not path or not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown layer '{layer}'")
    return FileResponse(path, media_type="application/geo+json", headers={"Cache-Control": "public, max-age=3600"})
