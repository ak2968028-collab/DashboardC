# Census 2011 location hierarchy (State > District > Sub-district > Village) used to pick a village.
from typing import Optional

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.models.base import Base


class State(Base):
    __tablename__ = "states"

    state_code: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    state_name: Mapped[str] = mapped_column(String, nullable=False)


class District(Base):
    __tablename__ = "districts"

    district_code: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    district_name: Mapped[str] = mapped_column(String, nullable=False)
    state_code: Mapped[int] = mapped_column(ForeignKey("states.state_code", ondelete="CASCADE"), nullable=False, index=True)


class Subdistrict(Base):
    __tablename__ = "subdistricts"

    subdistrict_code: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    subdistrict_name: Mapped[str] = mapped_column(String, nullable=False)
    district_code: Mapped[int] = mapped_column(
        ForeignKey("districts.district_code", ondelete="CASCADE"), nullable=False, index=True
    )


class CensusVillage(Base):
    """Every census village in India; village_code matches villages.village_code for surveyed villages."""
    __tablename__ = "census_villages"

    village_code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    village_name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    subdistrict_code: Mapped[int] = mapped_column(
        ForeignKey("subdistricts.subdistrict_code", ondelete="CASCADE"), nullable=False, index=True
    )
    population_2011: Mapped[Optional[int]] = mapped_column(Integer)
