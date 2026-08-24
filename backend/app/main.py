from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.db.init_db import init_database
from app.db.session import build_engine, build_session_factory


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    resolved_settings.images_dir.mkdir(parents=True, exist_ok=True)
    engine = build_engine(resolved_settings.database_url)

    @asynccontextmanager
    async def lifespan(_application: FastAPI):
        init_database(engine)
        yield
        engine.dispose()

    application = FastAPI(title=resolved_settings.app_name, lifespan=lifespan)
    application.state.settings = resolved_settings
    application.state.session_factory = build_session_factory(engine)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(resolved_settings.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(api_router, prefix=resolved_settings.api_prefix)
    application.mount("/media", StaticFiles(directory=resolved_settings.data_dir), name="media")
    return application


app = create_app()
