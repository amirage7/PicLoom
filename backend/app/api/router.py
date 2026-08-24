from fastapi import APIRouter

from app.api.routes.images import router as images_router
from app.api.routes.projects import router as projects_router
from app.api.routes.prompts import router as prompts_router
from app.api.routes.health import router as health_router
from app.api.routes.extension import router as extension_router
from app.api.routes.providers import router as providers_router


api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(projects_router)
api_router.include_router(prompts_router)
api_router.include_router(images_router)
api_router.include_router(providers_router)
api_router.include_router(extension_router)
