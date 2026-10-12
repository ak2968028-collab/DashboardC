# Boundary polygons (WGS84) loaded from the processed GeoJSON files; published by GeoServer.
from geoalchemy2 import Geometry
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.models.base import Base


def _polygons():
    return mapped_column(Geometry("MULTIPOLYGON", srid=4326, spatial_index=True), nullable=False)


class DistrictBoundary(Base):
    __tablename__ = "district_boundary"

    district: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    geom = _polygons()


class BlockBoundary(Base):
    __tablename__ = "block_boundaries"

    block_name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    geom = _polygons()


class VillageBoundary(Base):
    __tablename__ = "village_boundaries"

    village_code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    geom = _polygons()
