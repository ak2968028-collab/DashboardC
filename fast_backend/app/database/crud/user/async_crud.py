from sqlalchemy import delete, select
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.crud.base.async_base import CrudBase
from app.database.models import CensusVillage, DataSubmission, District, PradhanCertificate, State, Subdistrict, User
from app.database.models.user import STATUS_PENDING

Submitter = aliased(User)
Reviewer = aliased(User)
Verifier = aliased(User)

USER_COLUMNS = [
    User.id, User.username, User.full_name, User.role, User.village_code, User.is_active, User.created_at,
    User.verification_status, User.verification_comment, User.verified_at, Verifier.username.label("verified_by"),
    CensusVillage.village_name, Subdistrict.subdistrict_name, District.district_name, State.state_name,
    PradhanCertificate.filename.label("certificate_filename"),
    PradhanCertificate.modified_at.label("certificate_uploaded_at"),
]

SUBMISSION_COLUMNS = [
    DataSubmission.id, DataSubmission.village_code, DataSubmission.source, DataSubmission.values,
    DataSubmission.status, DataSubmission.review_comment, DataSubmission.created_at, DataSubmission.modified_at,
    DataSubmission.reviewed_at, CensusVillage.village_name, Subdistrict.subdistrict_name, District.district_name,
    Submitter.username.label("submitted_by"), Reviewer.username.label("reviewed_by"),
]


def _with_location(query, village_code_col):
    return (query.outerjoin(CensusVillage, CensusVillage.village_code == village_code_col)
            .outerjoin(Subdistrict, Subdistrict.subdistrict_code == CensusVillage.subdistrict_code)
            .outerjoin(District, District.district_code == Subdistrict.district_code)
            .outerjoin(State, State.state_code == District.state_code))


class User_crud(CrudBase):

    def __init__(self, db: AsyncSession, Model=User):
        super().__init__(db, Model)

    async def get_by_username(self, username: str) -> User | None:
        return await self.db.scalar(select(User).where(User.username == username))

    async def get_by_village(self, village_code: str) -> User | None:
        return await self.db.scalar(select(User).where(User.village_code == village_code))

    async def get_records(self, user_id: int | None = None, verification_status: str | None = None) -> list[dict]:
        query = (_with_location(select(*USER_COLUMNS).select_from(User), User.village_code)
                 .outerjoin(Verifier, Verifier.id == User.verified_by)
                 .outerjoin(PradhanCertificate, PradhanCertificate.user_id == User.id))
        if user_id is not None:
            query = query.where(User.id == user_id)
        if verification_status:
            query = query.where(User.verification_status == verification_status)
        result = await self.db.execute(query.order_by(User.role, User.username))
        return [dict(r) for r in result.mappings()]


class Certificate_crud(CrudBase):

    def __init__(self, db: AsyncSession, Model=PradhanCertificate):
        super().__init__(db, Model)

    async def get(self, user_id: int) -> PradhanCertificate | None:
        return await self.db.scalar(select(PradhanCertificate).where(PradhanCertificate.user_id == user_id))

    async def save(self, user_id: int, filename: str, content_type: str, data: bytes):
        """Stores the supervisor's certificate, replacing an earlier one."""
        await self.db.execute(delete(PradhanCertificate).where(PradhanCertificate.user_id == user_id))
        self.db.add(PradhanCertificate(user_id=user_id, filename=filename, content_type=content_type, data=data))


class Submission_crud(CrudBase):

    def __init__(self, db: AsyncSession, Model=DataSubmission):
        super().__init__(db, Model)

    async def get_records(self, status: str | None = None, village_code: str | None = None,
                          submission_id: int | None = None) -> list[dict]:
        query = _with_location(select(*SUBMISSION_COLUMNS).select_from(DataSubmission), DataSubmission.village_code)
        query = (query.outerjoin(Submitter, Submitter.id == DataSubmission.submitted_by)
                 .outerjoin(Reviewer, Reviewer.id == DataSubmission.reviewed_by))
        if status:
            query = query.where(DataSubmission.status == status)
        if village_code:
            query = query.where(DataSubmission.village_code == village_code)
        if submission_id is not None:
            query = query.where(DataSubmission.id == submission_id)
        result = await self.db.execute(query.order_by(DataSubmission.modified_at.desc()))
        return [dict(r) for r in result.mappings()]

    async def get_pending(self, village_code: str) -> DataSubmission | None:
        return await self.db.scalar(select(DataSubmission).where(
            DataSubmission.village_code == village_code, DataSubmission.status == STATUS_PENDING))
