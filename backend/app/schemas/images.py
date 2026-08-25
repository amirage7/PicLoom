from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ImageUpdate(BaseModel):
    name: str | None = None
    prompt: str | None = None
    tags: list[str] | None = None
    parent_id: str | None = None
    position_x: float | None = None
    position_y: float | None = None


class ImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    image_path: str
    image_url: str
    file_name: str
    name: str
    prompt: str
    tags: list[str]
    parent_id: str | None
    position_x: float
    position_y: float
    created_time: datetime
