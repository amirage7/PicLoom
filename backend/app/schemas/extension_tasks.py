from pydantic import BaseModel, Field

from app.schemas.generation import GenerationStatus


class ExtensionTaskUpdate(BaseModel):
    status: GenerationStatus
    progress_message: str = Field(min_length=1, max_length=255)
    error_code: str | None = Field(default=None, max_length=64)
    chat_url: str | None = Field(default=None, max_length=1024)
