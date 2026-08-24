from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import get_settings


router = APIRouter(tags=["system"])


class HealthResponse(BaseModel):
    status: Literal["ok"]
    app: str


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(status="ok", app=settings.app_name)
