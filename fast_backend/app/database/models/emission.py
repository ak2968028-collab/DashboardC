# Emission factor reference data and calculated (derived) village GHG emissions.
from typing import Optional

from sqlalchemy import Float, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.models.base import Base
from app.database.models.village import VillageRecord


def _tonnes():
    return mapped_column(Float, nullable=False, server_default=text("0"))


class EmissionFactor(Base):
    __tablename__ = "emission_factors"

    sector: Mapped[str] = mapped_column(String, nullable=False)
    activity: Mapped[str] = mapped_column(String, nullable=False)
    fuel_or_source: Mapped[str] = mapped_column(String, nullable=False)
    unit: Mapped[str] = mapped_column(String, nullable=False)
    emission_factor: Mapped[float] = mapped_column(Float, nullable=False)
    gas: Mapped[str] = mapped_column(String, nullable=False)
    co2e_factor: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("1"))
    reference_source: Mapped[Optional[str]] = mapped_column(Text)
    publication_year: Mapped[Optional[int]] = mapped_column(Integer)


class VillageEmissions(VillageRecord, Base):
    """Derived GHG emissions in t CO2e / year (per capita in kg CO2e / person / year)."""
    __tablename__ = "village_emissions"

    lpg_co2e_t_yr: Mapped[float] = _tonnes()
    firewood_co2e_t_yr: Mapped[float] = _tonnes()
    electricity_co2e_t_yr: Mapped[float] = _tonnes()
    energy_total_co2e_t_yr: Mapped[float] = _tonnes()
    transport_co2e_t_yr: Mapped[float] = _tonnes()
    waste_co2e_t_yr: Mapped[float] = _tonnes()
    livestock_co2e_t_yr: Mapped[float] = _tonnes()
    total_co2e_t_yr: Mapped[float] = _tonnes()
    per_capita_co2e_kg_yr: Mapped[float] = _tonnes()

    village: Mapped["Village"] = relationship(back_populates="emissions")
