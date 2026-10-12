# Village master table and its one-to-one survey parameter tables (Census 2011 & field survey).
from typing import Optional

from sqlalchemy import Float, ForeignKey, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.models.base import Base


def _amount():
    """Non-negative quantity (ha, kg, kWh, litres) defaulting to 0."""
    return mapped_column(Float, nullable=False, server_default=text("0"))


def _count():
    return mapped_column(Integer, nullable=False, server_default=text("0"))


class Village(Base):
    __tablename__ = "villages"

    village_code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    village_name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    block_name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    subdistrict: Mapped[Optional[str]] = mapped_column(String)
    district: Mapped[str] = mapped_column(String, nullable=False, server_default="Varanasi")
    state: Mapped[str] = mapped_column(String, nullable=False, server_default="Uttar Pradesh")
    latitude: Mapped[Optional[float]] = mapped_column(Float)
    longitude: Mapped[Optional[float]] = mapped_column(Float)
    data_status: Mapped[str] = mapped_column(String, nullable=False, server_default="BASELINE_SURVEY_DATA")

    demographics: Mapped["Demographics"] = relationship(back_populates="village", cascade="all, delete-orphan")
    land_use: Mapped["LandUse"] = relationship(back_populates="village", cascade="all, delete-orphan")
    water_resources: Mapped["WaterResources"] = relationship(back_populates="village", cascade="all, delete-orphan")
    energy: Mapped["EnergyConsumption"] = relationship(back_populates="village", cascade="all, delete-orphan")
    waste: Mapped["WasteManagement"] = relationship(back_populates="village", cascade="all, delete-orphan")
    transport: Mapped["TransportActivity"] = relationship(back_populates="village", cascade="all, delete-orphan")
    livestock: Mapped["LivestockPopulation"] = relationship(back_populates="village", cascade="all, delete-orphan")
    emissions: Mapped["VillageEmissions"] = relationship(back_populates="village", cascade="all, delete-orphan")


class VillageRecord:
    """One row per village, linked by village_id."""
    village_id: Mapped[int] = mapped_column(ForeignKey("villages.id", ondelete="CASCADE"), unique=True, nullable=False)


class Demographics(VillageRecord, Base):
    __tablename__ = "demographics"

    total_residents: Mapped[int] = _count()
    total_households: Mapped[int] = _count()
    total_male: Mapped[int] = _count()
    total_female: Mapped[int] = _count()

    village: Mapped["Village"] = relationship(back_populates="demographics")


class LandUse(VillageRecord, Base):
    __tablename__ = "land_use"

    total_area_ha: Mapped[float] = _amount()
    builtup_area_ha: Mapped[float] = _amount()
    agri_area_ha: Mapped[float] = _amount()
    forest_area_ha: Mapped[float] = _amount()
    barren_area_ha: Mapped[float] = _amount()
    culturable_waste_ha: Mapped[float] = _amount()
    fallow_land_ha: Mapped[float] = _amount()
    remaining_area_ha: Mapped[float] = _amount()

    village: Mapped["Village"] = relationship(back_populates="land_use")


class WaterResources(VillageRecord, Base):
    __tablename__ = "water_resources"

    pond_area_ha: Mapped[float] = _amount()
    river_area_ha: Mapped[float] = _amount()
    canal_area_ha: Mapped[float] = _amount()
    well_irrig_area_ha: Mapped[float] = _amount()
    other_water_ha: Mapped[float] = _amount()
    total_water_area_ha: Mapped[float] = _amount()

    village: Mapped["Village"] = relationship(back_populates="water_resources")


class EnergyConsumption(VillageRecord, Base):
    """Monthly household & agricultural energy use."""
    __tablename__ = "energy_consumption"

    lpg_monthly_kg: Mapped[float] = _amount()
    firewood_monthly_kg: Mapped[float] = _amount()
    electricity_monthly_kwh: Mapped[float] = _amount()

    village: Mapped["Village"] = relationship(back_populates="energy")


class WasteManagement(VillageRecord, Base):
    __tablename__ = "waste_management"

    waste_monthly_kg: Mapped[float] = _amount()

    village: Mapped["Village"] = relationship(back_populates="waste")


class TransportActivity(VillageRecord, Base):
    __tablename__ = "transport_activity"

    motorbikes_count: Mapped[int] = _count()
    petrol_monthly_litres: Mapped[float] = _amount()

    village: Mapped["Village"] = relationship(back_populates="transport")


class LivestockPopulation(VillageRecord, Base):
    __tablename__ = "livestock_population"

    cows_count: Mapped[int] = _count()
    goats_count: Mapped[int] = _count()
    sheep_count: Mapped[int] = _count()
    total_livestock: Mapped[int] = _count()

    village: Mapped["Village"] = relationship(back_populates="livestock")
