# Login accounts (admin / village supervisor) and supervisor data submissions awaiting admin review.
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, LargeBinary, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database.models.base import Base

ROLE_ADMIN = "admin"
ROLE_SUPERVISOR = "supervisor"

STATUS_PENDING = "pending"
STATUS_APPROVED = "approved"
STATUS_REJECTED = "rejected"

# Supervisor verification: picks a village + uploads the Pradhan certificate (pending), admin verifies or rejects.
VERIFY_NONE = "unverified"  # no village chosen yet
VERIFY_PENDING = "pending"
VERIFY_DONE = "verified"
VERIFY_REJECTED = "rejected"


class User(Base):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String)
    role: Mapped[str] = mapped_column(String, nullable=False)
    # One supervisor per village (census code); admins have none.
    village_code: Mapped[Optional[str]] = mapped_column(
        ForeignKey("census_villages.village_code", ondelete="SET NULL"), unique=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    # Supervisors only (null for admins); data entry is unlocked once verified.
    verification_status: Mapped[Optional[str]] = mapped_column(String)
    verification_comment: Mapped[Optional[str]] = mapped_column(Text)
    verified_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime)


class PradhanCertificate(Base):
    """Pradhan certificate uploaded by a supervisor for verification (file bytes kept in the database)."""
    __tablename__ = "pradhan_certificates"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    filename: Mapped[str] = mapped_column(String, nullable=False)
    content_type: Mapped[str] = mapped_column(String, nullable=False)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)


class DataSubmission(Base):
    """Survey values proposed by a supervisor; written to the village tables only once an admin approves."""
    __tablename__ = "data_submissions"

    village_code: Mapped[str] = mapped_column(
        ForeignKey("census_villages.village_code", ondelete="CASCADE"), nullable=False, index=True
    )
    submitted_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    source: Mapped[str] = mapped_column(String, nullable=False)  # form | excel
    values: Mapped[dict] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, server_default=STATUS_PENDING, index=True)
    review_comment: Mapped[Optional[str]] = mapped_column(Text)
    reviewed_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
