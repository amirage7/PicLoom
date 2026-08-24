from fastapi import APIRouter

from app.api.routes.projects import router as projects_router
from app.api.routes.prompts import router as prompts_router
from app.api.routes.health import router as health_router


api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(projects_router)
api_router.include_router(prompts_router)
