from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


ProjectName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
PromptTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
PromptContent = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
PromptCategory = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class ProjectCreate(BaseModel):
    name: ProjectName


class ProjectUpdate(BaseModel):
    name: ProjectName


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_time: datetime
    image_count: int = 0


class PromptCreate(BaseModel):
    title: PromptTitle
    content: PromptContent
    category: PromptCategory


class PromptUpdate(BaseModel):
    title: PromptTitle | None = None
    content: PromptContent | None = None
    category: PromptCategory | None = None


class PromptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    content: str
    category: str
    created_time: datetime
