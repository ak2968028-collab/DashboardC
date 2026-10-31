from fastapi import APIRouter

from app.api.routes import admin, auth, data_io, district, emissions, geo, locations, supervisor, villages

app_router = APIRouter()

app_router.include_router(
    district.router,
    tags=["District"]
)
app_router.include_router(
    villages.router,
    prefix="/villages",
    tags=["Villages"]
)
app_router.include_router(
    emissions.router,
    tags=["Carbon Emissions"]
)
app_router.include_router(
    data_io.router,
    tags=["Excel Import / Export"]
)
app_router.include_router(
    geo.router,
    prefix="/geo",
    tags=["GIS Layers"]
)
app_router.include_router(
    locations.router,
    prefix="/locations",
    tags=["Locations (Census 2011)"]
)
app_router.include_router(
    auth.router,
    prefix="/auth",
    tags=["Auth"]
)
app_router.include_router(
    supervisor.router,
    prefix="/supervisor",
    tags=["Supervisor (village data entry)"]
)
app_router.include_router(
    admin.router,
    prefix="/admin",
    tags=["Admin (users & approvals)"]
)
