from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.entities import Base


class GenerationTask(Base):
    __tablename__ = "generation_tasks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False, default="chatgpt-web")
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    parent_image_id: Mapped[str | None] = mapped_column(ForeignKey("images.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    progress_message: Mapped[str] = mapped_column(String(255), nullable=False)
    chat_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    image_id: Mapped[str | None] = mapped_column(ForeignKey("images.id", ondelete="SET NULL"), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
