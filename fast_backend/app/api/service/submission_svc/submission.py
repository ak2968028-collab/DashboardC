# ====================================================================
# app/api/service/submission_svc/submission.py
# Supervisor data submissions (web form / one-village Excel template) and admin review.
# Nothing reaches the dashboard tables until an admin approves a submission.
# ====================================================================
import io
import math
from datetime import datetime

import pandas as pd
from fastapi import HTTPException, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.service.carbon_svc.carbon import recompute_and_save_all_emissions
from app.api.service.submission_svc.fields import (
    FIELD_KEYS, FIELDS, INTEGER_KEYS, REQUIRED_FOR_NEW_VILLAGE, record_rows, with_derived,
)
from app.database.crud.location.async_crud import Location_crud
from app.database.crud.user.async_crud import Submission_crud
from app.database.crud.village.async_crud import Village_crud, Village_record_crud
from app.database.models import DataSubmission, User, Village
from app.database.models.user import STATUS_APPROVED, STATUS_PENDING, STATUS_REJECTED, VERIFY_DONE

TEMPLATE_SHEET = "Survey Data"
APPROVED_DATA_STATUS = "SUPERVISOR_SUBMITTED_ADMIN_APPROVED"


def _bad_request(detail: str):
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _require_verified(user: User):
    if not user.village_code:
        raise _bad_request("Select your village before submitting data")
    if user.verification_status != VERIFY_DONE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Data entry opens once the admin has verified your Pradhan certificate")


def clean_values(raw: dict) -> dict:
    """Keeps known survey fields with a value; rejects anything that is not a non-negative number."""
    labels = {f["key"]: f["label"] for f in FIELDS}
    values, errors = {}, []
    for key in FIELD_KEYS:
        value = raw.get(key)
        if value is None or (isinstance(value, str) and not value.strip()):
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            errors.append(f"{labels[key]}: '{value}' is not a number")
            continue
        if math.isnan(number):
            continue
        if math.isinf(number) or number < 0:
            errors.append(f"{labels[key]}: must be zero or more")
        elif key in INTEGER_KEYS and not number.is_integer():
            errors.append(f"{labels[key]}: must be a whole number")
        else:
            values[key] = int(number) if key in INTEGER_KEYS else number
    if errors:
        raise _bad_request("; ".join(errors))
    return values


def check_warnings(values: dict) -> list[str]:
    """Consistency checks shown to the admin; they do not block a submission."""
    v = with_derived(values)
    warnings = []
    if v["total_area_ha"] > 0 and v["builtup_area_ha"] + v["agri_area_ha"] + v["forest_area_ha"] > v["total_area_ha"] * 1.05:
        warnings.append("Built-up + agricultural + forest area is more than the total village area.")
    if v["total_male"] + v["total_female"] and v["total_male"] + v["total_female"] != v["total_residents"]:
        warnings.append("Male + female population does not equal total residents.")
    if v["total_households"] > v["total_residents"] > 0:
        warnings.append("There are more households than residents.")
    return warnings


async def current_values(db: AsyncSession, village_code: str) -> dict | None:
    """The village's survey values on the dashboard now; None if it is not on the dashboard."""
    details = await Village_crud(db).get_details(village_code)
    return {k: details.get(k) for k in FIELD_KEYS} if details else None


class submission_svc:

    async def submit(db: AsyncSession, user: User, raw: dict, source: str) -> int:
        """Creates the village's pending submission, or replaces the values of the one already waiting."""
        _require_verified(user)
        values = clean_values(raw)
        current = await current_values(db, user.village_code)
        if current is None:
            missing = [f["label"] for f in FIELDS if f["key"] in REQUIRED_FOR_NEW_VILLAGE and f["key"] not in values]
            if missing:
                raise _bad_request(f"This village is new to the dashboard; please fill: {', '.join(missing)}")
        elif all(current.get(k) is not None and float(current[k]) == float(v) for k, v in values.items()):
            raise _bad_request("No changes compared to the data already on the dashboard")
        if not values:
            raise _bad_request("Enter at least one value")

        submission = await Submission_crud(db).get_pending(user.village_code)
        if submission:
            submission.values, submission.source, submission.submitted_by = values, source, user.id
        else:
            submission = DataSubmission(village_code=user.village_code, submitted_by=user.id, source=source, values=values)
            db.add(submission)
        await db.flush()
        return submission.id

    async def parse_excel(user: User, content: bytes) -> dict:
        """Reads the supervisor's own village row from an uploaded template."""
        try:
            df = await run_in_threadpool(pd.read_excel, io.BytesIO(content), sheet_name=0, dtype={"village_code": str})
        except Exception:
            raise _bad_request("Could not read the file; upload the .xlsx template downloaded from this page")
        if "village_code" not in df.columns:
            raise _bad_request("The sheet has no 'village_code' column; use the downloaded template")
        codes = df["village_code"].astype(str).str.strip().str.removesuffix(".0")
        rows = df[codes == user.village_code]
        if rows.empty:
            raise _bad_request(f"No row for your village code {user.village_code} in the sheet")
        if not any(k in df.columns for k in FIELD_KEYS):
            raise _bad_request("The sheet has none of the survey columns; use the downloaded template")
        row = rows.iloc[0]
        return {k: (None if pd.isna(row[k]) else row[k]) for k in FIELD_KEYS if k in df.columns}

    async def template(db: AsyncSession, user: User) -> bytes:
        """One-row workbook for the supervisor's village (current values pre-filled) and a field guide."""
        _require_verified(user)
        village = await Location_crud(db).get_village(user.village_code)
        current = await current_values(db, user.village_code) or {}
        data = pd.DataFrame([{"village_code": user.village_code, "village_name": village["village_name"],
                              **{k: current.get(k) for k in FIELD_KEYS}}])
        guide = pd.DataFrame([{"column": f["key"], "meaning": f["label"], "unit": f["unit"], "section": f["section"],
                               "whole number": "yes" if f["integer"] else ""} for f in FIELDS])

        def to_xlsx():
            buffer = io.BytesIO()
            with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
                data.to_excel(writer, index=False, sheet_name=TEMPLATE_SHEET)
                guide.to_excel(writer, index=False, sheet_name="Field Guide")
                for sheet in writer.sheets.values():
                    for column in sheet.columns:
                        sheet.column_dimensions[column[0].column_letter].width = max(14, len(str(column[0].value)) + 2)
            return buffer.getvalue()

        return await run_in_threadpool(to_xlsx)

    async def get_submission(db: AsyncSession, submission_id: int) -> dict:
        rows = await Submission_crud(db).get_records(submission_id=submission_id)
        if not rows:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Submission {submission_id} not found")
        return rows[0]

    async def get_details(db: AsyncSession, submission_id: int) -> dict:
        submission = await submission_svc.get_submission(db, submission_id)
        current = await current_values(db, submission["village_code"])
        return {**submission, "current": current,
                "warnings": check_warnings({**(current or {}), **submission["values"]})}

    async def _pending(db: AsyncSession, submission_id: int) -> DataSubmission:
        submission = await db.get(DataSubmission, submission_id)
        if not submission:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Submission {submission_id} not found")
        if submission.status != STATUS_PENDING:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Submission is already {submission.status}")
        return submission

    async def approve(db: AsyncSession, admin: User, submission_id: int, comment: str | None) -> int:
        """Writes the submission into the village tables and recomputes emissions; returns villages recalculated."""
        submission = await submission_svc._pending(db, submission_id)
        code = submission.village_code
        current = await current_values(db, code)
        village_crud = Village_crud(db)
        if current is None:
            census = await Location_crud(db).get_village(code)
            village_id, _ = await village_crud.upsert_village({
                "village_code": code, "village_name": census["village_name"],
                "block_name": census["subdistrict_name"], "subdistrict": census["subdistrict_name"],
                "district": census["district_name"], "state": census["state_name"],
                "data_status": APPROVED_DATA_STATUS,
            })
        else:
            village_id = await db.scalar(
                update(Village).where(Village.village_code == code)
                .values(data_status=APPROVED_DATA_STATUS, modified_at=func.now()).returning(Village.id))

        values = with_derived({**(current or {}), **submission.values})
        for model, row in record_rows(village_id, values).items():
            await Village_record_crud(db, model).upsert([row])

        submission.status, submission.review_comment = STATUS_APPROVED, comment
        submission.reviewed_by, submission.reviewed_at = admin.id, datetime.now()
        return await recompute_and_save_all_emissions(db)

    async def reject(db: AsyncSession, admin: User, submission_id: int, comment: str):
        submission = await submission_svc._pending(db, submission_id)
        submission.status, submission.review_comment = STATUS_REJECTED, comment
        submission.reviewed_by, submission.reviewed_at = admin.id, datetime.now()

    async def withdraw(db: AsyncSession, user: User, submission_id: int):
        """A supervisor deletes their own village's pending submission."""
        submission = await submission_svc._pending(db, submission_id)
        if submission.village_code != user.village_code:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This submission is not for your village")
        await db.delete(submission)
