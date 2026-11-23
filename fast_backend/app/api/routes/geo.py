from fastapi import APIRouter, File, Form, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool

from app.api.schema.geo_schema import Raster_factor, Raster_layer, Village_factor_stats
from app.api.service.auth_svc.dependencies import current_user
from app.api.service.geoserver_svc import emission_rasters, factors
from app.api.service.geoserver_svc.geoserver import DEM_LAYER, RASTER_WORKSPACE, WORKSPACE
from app.database.models.user import ROLE_ADMIN

router = APIRouter()


# Base data overlays on the Village Map (published by script/geoserver_raster.py and script/geoserver_publish.py).
BASE_OVERLAYS = [
    {'name': DEM_LAYER, 'title': 'Elevation (DEM)', 'group': 'terrain'},
    {'name': 'khasra_parcels', 'title': 'Khasra Parcels (zoom in)', 'group': 'cadastral'},
]


@router.get("/rasters", response_model=list[Raster_layer])
async def get_raster_layers():
    """Map overlays published on GeoServer (WMS): the condition rasters (listed from GeoServer), the DEM and the
    khasra parcels."""
    rasters = [
        {'name': f['name'], 'title': f['title'], 'group': f['group'].lower(), 'workspace': f['workspace'], 'layer': f['layer']}
        for f in await run_in_threadpool(factors.list_factors) if f['workspace'] == RASTER_WORKSPACE
    ]
    base = [{**o, 'workspace': WORKSPACE, 'layer': f"{WORKSPACE}:{o['name']}"} for o in BASE_OVERLAYS]
    return rasters + base


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


