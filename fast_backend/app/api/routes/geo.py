from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse

from app.api.schema.geo_schema import Emission_raster_report, Raster_factor, Raster_layer, Village_factor_stats
from app.api.service.auth_svc.dependencies import admin_user, current_user
from app.api.service.geoserver_svc import emission_rasters, factors
from app.database.config.dependency import db_read
from app.api.service.geoserver_svc.geoserver import RASTER_WORKSPACE, find_rasters, raster_title
from app.database.models.user import ROLE_ADMIN
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


@router.post("/emission-rasters", response_model=Emission_raster_report)
async def generate_emission_rasters(db: db_read, _: admin_user):
    """Rebuilds the carbon emission rasters from the current village inventory (spread by LULC) and publishes
    them to GeoServer. Also runs after every emissions recompute."""
    return await emission_rasters.regenerate(db)


@router.get("/emission-grid")
async def get_emission_grid(village: str = Query(...)):
    """The village's cells of each source emission raster (t CO2e/ha/yr, from GeoServer) for scenario rescaling."""
    return await run_in_threadpool(emission_rasters.village_grid, village)


@router.get("/factors", response_model=list[Raster_factor])
async def get_raster_factors():
    """Raster factors listed from GeoServer: curated layers plus factors added from the dashboard (temporary workspace)."""
    return await run_in_threadpool(factors.list_factors)


@router.post("/factors", response_model=Raster_factor, status_code=status.HTTP_201_CREATED)
async def add_raster_factor(
    user: current_user,
    title: str = Form(..., min_length=2, max_length=80),
    unit: str | None = Form(None, max_length=30),
    description: str | None = Form(None, max_length=500),
    ramp: str = Form("viridis"),
    tif: UploadFile = File(..., description="Single-band GeoTIFF"),
    sld: UploadFile | None = File(None, description="Optional SLD style; an automatic colour map is made otherwise"),
):
    """Pushes a new factor raster to GeoServer's temporary workspace (logged-in users)."""
    tif_bytes = await tif.read()
    sld_bytes = await sld.read() if sld and sld.filename else None
    return await run_in_threadpool(
        factors.upload_factor, title.strip(), (unit or "").strip() or None, (description or "").strip() or None,
        ramp, tif_bytes, sld_bytes, user.username,
    )


@router.delete("/factors/{name}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_raster_factor(user: current_user, name: str):
    """Removes a factor added from the dashboard (its uploader or an admin)."""
    await run_in_threadpool(factors.delete_factor, name, user.username, user.role == ROLE_ADMIN)


@router.get("/factors/stats", response_model=Village_factor_stats)
async def get_village_factor_stats(layer: str = Query(..., description="workspace:name"), village: str = Query(...)):
    """Raster values inside one village boundary: min / max / mean and the share of each legend class."""
    return await run_in_threadpool(factors.village_stats, layer, village)


@router.get("/{layer}")
async def get_geojson_layer(layer: str):
    """Boundary GeoJSON: district, blocks or villages."""
    path = settings.GEOJSON_LAYERS.get(layer)
    if not path or not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown layer '{layer}'")
    return FileResponse(path, media_type="application/geo+json", headers={"Cache-Control": "public, max-age=3600"})
