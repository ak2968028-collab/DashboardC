from fastapi import APIRouter

from app.api.routes import data_io, district, emissions, geo, villages

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
