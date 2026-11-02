from pydantic import BaseModel

Point = tuple[float, float]


class Scene_parcel(BaseModel):
    khasra: str | None = None
    area_m2: float
    use: str  # builtup | cropland | trees | water | rangeland | bare (from LULC), or "land" when unknown
    ring: list[Point]


class Village_scene(BaseModel):
    """Real cadastral layout of one village for the Carbon Lab 3D view.
    Coordinates are metres (UTM 44N, EPSG:32644) relative to `origin`, x east and y north."""
    village_code: str
    source: str
    landcover_source: str  # LULC raster, or an estimate from parcel density outside the LULC extent
    landcover_ha: dict[str, float] = {}  # LULC area per use inside the village parcels
    origin: Point
    extent_m: Point
    parcel_count: int
    builtup_est_ha: float
    households_per_house: float
    parcels: list[Scene_parcel]
    outline: list[Point]
    houses: list[Point]
    route: list[Point]
    pasture: list[Point]
    dump: Point
    trees: list[Point]
