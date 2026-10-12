from app.database.models.base import Base
from app.database.models.village import (
    Village,
    Demographics,
    LandUse,
    WaterResources,
    EnergyConsumption,
    WasteManagement,
    TransportActivity,
    LivestockPopulation,
)
from app.database.models.emission import (
    EmissionFactor,
    VillageEmissions,
)
from app.database.models.spatial import (
    DistrictBoundary,
    BlockBoundary,
    VillageBoundary,
)
