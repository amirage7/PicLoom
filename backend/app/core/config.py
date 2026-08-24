from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AI Image Canvas"
    api_prefix: str = "/api"
    cors_origins: tuple[str, ...] = (
        "http://127.0.0.1:3000",
        "http://localhost:3000",
    )

    model_config = SettingsConfigDict(
        env_prefix="AI_IMAGE_CANVAS_",
        frozen=True,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
