from pydantic import BaseModel


class Emission_factor(BaseModel):
    activity: str
    unit: str
    factor: float
    factor_unit: str
    standard: str


class Recompute_response(BaseModel):
    villages_recalculated: int


class Import_report(BaseModel):
    total_rows: int
    inserted: int
    updated: int
    warnings: list[str]
    villages_recalculated: int
