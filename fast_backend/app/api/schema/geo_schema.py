from pydantic import BaseModel


class Raster_layer(BaseModel):
    name: str
    title: str
    group: str
    workspace: str
    layer: str  # GeoServer WMS layer name (workspace:name)
