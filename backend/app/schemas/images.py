from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ImageUpdate(BaseModel):
    project_id: str | None = None
    name: str | None = None
    prompt: str | None = None
    tags: list[str] | None = None
    parent_id: str | None = None
    position_x: float | None = None
    position_y: float | None = None
    is_on_canvas: bool | None = None
    is_favorite: bool | None = None


class ImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str | None
    image_path: str
    image_url: str
    file_name: str
    name: str
    prompt: str
    tags: list[str]
    parent_id: str | None
    source_ids: list[str]
    position_x: float
    position_y: float
    is_on_canvas: bool
    is_favorite: bool
    source_type: str
    created_time: datetime


class ImageRelationCreate(BaseModel):
    source_id: str = Field(min_length=1, max_length=64)
    target_id: str = Field(min_length=1, max_length=64)


class ImageRelationResponse(BaseModel):
    id: str
    source_id: str
    target_id: str
    relation_type: str
    created_time: datetime
