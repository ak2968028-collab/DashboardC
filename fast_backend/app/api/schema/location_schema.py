from typing import Optional

from pydantic import BaseModel


class State_record(BaseModel):
    state_code: int
    state_name: str


class District_record(BaseModel):
    district_code: int
    district_name: str
    state_code: int


class Subdistrict_record(BaseModel):
    subdistrict_code: int
    subdistrict_name: str
    district_code: int


class Census_village(BaseModel):
    village_code: str
    village_name: str
    subdistrict_code: int
    population_2011: Optional[int] = None
    on_dashboard: bool  # village already has survey data in the dashboard


class Census_village_details(Census_village):
    subdistrict_name: str
    district_code: int
    district_name: str
    state_code: int
    state_name: str
