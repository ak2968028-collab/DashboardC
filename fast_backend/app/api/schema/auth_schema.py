from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class Login_request(BaseModel):
    username: str
    password: str


class User_record(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    role: str
    village_code: Optional[str] = None
    village_name: Optional[str] = None
    subdistrict_name: Optional[str] = None
    district_name: Optional[str] = None
    state_name: Optional[str] = None
    is_active: bool
    created_at: datetime
    # Supervisors: unverified (no village yet) | pending | verified | rejected; null for admins.
    verification_status: Optional[str] = None
    verification_comment: Optional[str] = None
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None
    certificate_filename: Optional[str] = None
    certificate_uploaded_at: Optional[datetime] = None


class Login_response(BaseModel):
    access_token: str
    token_type: str
    user: User_record


class Password_change(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


class User_create(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=6)
    full_name: Optional[str] = None
    role: Literal["admin", "supervisor"]
    village_code: Optional[str] = None


class User_update(BaseModel):
    """Only the fields sent are changed; village_code null unlinks the village."""
    full_name: Optional[str] = None
    password: Optional[str] = Field(None, min_length=6)
    village_code: Optional[str] = None
    is_active: Optional[bool] = None


class Verification_review(BaseModel):
    comment: Optional[str] = None


class Verification_reject(BaseModel):
    comment: str = Field(min_length=1)
