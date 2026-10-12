from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class Village_record(BaseModel):
    """Village activity data and calculated emissions (dashboard list / map / ranking)."""
    village_id: int
    village_code: str
    village_name: str
    block_name: str
    subdistrict: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    total_residents: Optional[int] = None
    total_households: Optional[int] = None
    total_area_ha: Optional[float] = None
    builtup_area_ha: Optional[float] = None
    agri_area_ha: Optional[float] = None
    total_water_area_ha: Optional[float] = None
    lpg_monthly_kg: Optional[float] = None
    firewood_monthly_kg: Optional[float] = None
    electricity_monthly_kwh: Optional[float] = None
    waste_monthly_kg: Optional[float] = None
    motorbikes_count: Optional[int] = None
    petrol_monthly_litres: Optional[float] = None
    cows_count: Optional[int] = None
    goats_count: Optional[int] = None
    sheep_count: Optional[int] = None
    total_livestock: Optional[int] = None
    lpg_co2e_t_yr: Optional[float] = None
    firewood_co2e_t_yr: Optional[float] = None
    electricity_co2e_t_yr: Optional[float] = None
    energy_total_co2e_t_yr: Optional[float] = None
    transport_co2e_t_yr: Optional[float] = None
    waste_co2e_t_yr: Optional[float] = None
    livestock_co2e_t_yr: Optional[float] = None
    total_co2e_t_yr: Optional[float] = None
    per_capita_co2e_kg_yr: Optional[float] = None


class Village_details(Village_record):
    """Complete record of all 12 parameters for one village."""
    district: str
    state: str
    data_status: str
    created_at: datetime
    modified_at: datetime
    total_male: Optional[int] = None
    total_female: Optional[int] = None
    forest_area_ha: Optional[float] = None
    barren_area_ha: Optional[float] = None
    culturable_waste_ha: Optional[float] = None
    fallow_land_ha: Optional[float] = None
    remaining_area_ha: Optional[float] = None
    pond_area_ha: Optional[float] = None
    river_area_ha: Optional[float] = None
    canal_area_ha: Optional[float] = None
    well_irrig_area_ha: Optional[float] = None
    other_water_ha: Optional[float] = None
