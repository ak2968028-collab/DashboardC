from pydantic import BaseModel

Point = tuple[float, float]
Point3D = tuple[float, float, float]


class Scene_parcel(BaseModel):
    khasra: str | None = None
    area_m2: float
    use: str  # builtup | cropland | trees | water | rangeland | bare (from LULC), or "land" when unknown
    ring: list[Point]


class House3D(BaseModel):
    pos: Point3D  # [x, y, z_rel_m] relative to village origin and base elevation
    elevation_m: float  # Absolute elevation above sea level in meters
    stories: int = 1
    style: str = "tiled"  # tiled | pucca | homestead
    roof: str = "gable"  # gable | flat | hipped
    rot: float = 0.0  # rotation in radians


class Village_elevation(BaseModel):
    village_code: str
    source: str = "UP_DEM (1000m GeoTIFF, EPSG:3395)"
    base_elevation_m: float
    min_elevation_m: float
    max_elevation_m: float
    relief_m: float
    grid_dim: tuple[int, int]  # (rows, cols)
    elevation_grid: list[list[float]]  # elevation in meters relative to base_elevation_m
    bounds_m: tuple[float, float, float, float]  # [minx, miny, maxx, maxy] local coordinates
    houses: list[House3D] = []


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
    # DEM Elevation Data
    elevation_source: str = "UP_DEM (1000m GeoTIFF)"
    elevation_base_m: float = 0.0
    elevation_min_m: float = 0.0
    elevation_max_m: float = 0.0
    elevation_relief_m: float = 0.0
    elevation_grid: list[list[float]] = []  # 2D grid of relative elevations (meters)
    houses_3d: list[House3D] = []
