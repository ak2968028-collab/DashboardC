from typing import Literal

from pydantic import BaseModel, Field


class Chat_turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class Chat_request(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[Chat_turn] = Field(default_factory=list, max_length=40)
    # Vector area uploaded with POST /api/chat/area, if the user attached one.
    area_id: str | None = Field(None, pattern=r"^[0-9a-f]{12}$")
