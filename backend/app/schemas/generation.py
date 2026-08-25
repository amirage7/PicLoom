from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


DesktopGenerationState = Literal[
    "queued", "opening_chatgpt", "login_required", "ready", "sending",
    "generating", "collecting", "importing", "completed", "refused",
    "rate_limited", "page_changed", "failed", "cancelled",
]

GenerationStatus = Literal[
    "queued", "connecting", "sending", "generating", "downloading",
    "completed", "failed", "cancelled", "opening_chatgpt", "login_required",
    "ready", "collecting", "importing", "refused", "rate_limited", "page_changed",
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
    provider_mode: str
    batch_id: str | None
    image_ids_json: str
    attempt: int
    last_page_url: str | None
    progress_message: str
    chat_url: str | None
    image_id: str | None
    error_code: str | None
    created_time: datetime
    updated_time: datetime


class DesktopTaskStateUpdate(BaseModel):
    state: DesktopGenerationState
    message: str = Field(min_length=1, max_length=500)
    last_page_url: str | None = Field(default=None, max_length=2048)


class GenerationBatchResult(BaseModel):
    task_id: str
    batch_id: str
    image_ids: list[str]
    deduplicated_count: int
