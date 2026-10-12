from pydantic import BaseModel


class Block_emission(BaseModel):
    block_name: str
    total_co2e_t_yr: float


class Sector_emission(BaseModel):
    sector: str
    co2e_t_yr: float


class District_summary(BaseModel):
    total_villages: int
    total_population: float
    total_area_ha: float
    total_co2e_t_yr: float
    mean_per_capita_co2e_kg_yr: float
    block_emissions: list[Block_emission]
    sector_emissions: list[Sector_emission]
