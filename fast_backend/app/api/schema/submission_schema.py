from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.api.schema.location_schema import Census_village_details


class Survey_field(BaseModel):
    key: str
    label: str
    unit: str
    section: str
    integer: bool


class Submission_record(BaseModel):
    id: int
    village_code: str
    village_name: Optional[str] = None
    subdistrict_name: Optional[str] = None
    district_name: Optional[str] = None
    source: str
    values: dict[str, float]
    status: str
    review_comment: Optional[str] = None
    submitted_by: Optional[str] = None
    reviewed_by: Optional[str] = None
    created_at: datetime
    modified_at: datetime
    reviewed_at: Optional[datetime] = None


class Submission_details(Submission_record):
    current: Optional[dict[str, Optional[float]]] = None  # None: village not on the dashboard yet
    warnings: list[str]


class Supervisor_village(BaseModel):
    village: Optional[Census_village_details] = None  # None until the supervisor selects a village
    current: Optional[dict[str, Optional[float]]] = None


class Submission_values(BaseModel):
    values: dict[str, float | int | str | None]


class Review_request(BaseModel):
    comment: Optional[str] = None


class Reject_request(BaseModel):
    comment: str


class Approve_response(BaseModel):
    villages_recalculated: int
