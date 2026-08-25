from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


GenerationStatus = Literal[
    "queued", "connecting", "sending", "generating", "downloading",
    "completed", "failed", "cancelled",
]


class GenerationTaskCreate(BaseModel):
    project_id: str
    prompt: str = Field(min_length=1, max_length=12000)
    parent_image_id: str | None = None


class GenerationTaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    provider: str
    prompt: str
    parent_image_id: str | None
    status: GenerationStatus
    progress_message: str
    chat_url: str | None
    image_id: str | None
    error_code: str | None
    created_time: datetime
    updated_time: datetime
