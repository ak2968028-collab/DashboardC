from pydantic import BaseModel


class Raster_layer(BaseModel):
    name: str
    title: str
    group: str
    workspace: str
    layer: str  # GeoServer WMS layer name (workspace:name)


class Legend_entry(BaseModel):
    color: str
    quantity: float
    label: str
    opacity: float = 1.0


class Raster_factor(BaseModel):
    """A raster layer as published on GeoServer, with its legend parsed from the layer's SLD."""
    name: str
    title: str
    workspace: str
    layer: str
    kind: str  # emission (generated from the inventory) | condition (curated) | upload
    source: str | None = None  # emission source key for kind=emission (lpg, firewood, …, total)
    group: str
    temporary: bool  # added from the dashboard into the temporary workspace
    description: str | None = None
    unit: str | None = None
    uploaded_by: str | None = None
    uploaded_at: str | None = None
    bbox: list[float | None] | None = None  # lon/lat: minx, miny, maxx, maxy
    legend_type: str | None = None  # SLD ColorMap type: ramp | intervals | values
    legend: list[Legend_entry] = []


class Factor_class_share(BaseModel):
    label: str
    color: str
    share_pct: float


class Village_factor_stats(BaseModel):
    layer: str
    village_code: str
    covered: bool  # False when the raster has no valid pixels inside the village
    pixels: int
    valid_pixels: int
    min: float | None = None
    max: float | None = None
    mean: float | None = None
    total: float | None = None  # density rasters (…/ha): value summed over the village area
    classes: list[Factor_class_share] = []


class Emission_raster_report(BaseModel):
    layers: list[str]
    grid: dict
    villages_placed: int
    villages_without_boundary: int
    villages_without_lulc: int
    inventory_t: float
    placed_t: float
    generated_at: str
