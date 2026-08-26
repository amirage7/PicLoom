from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    images: Mapped[list[Image]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Image(Base):
    __tablename__ = "images"
    __table_args__ = (
        Index("ux_images_project_name_key", "project_id", "name_key", unique=True),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=True)
    image_path: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    name_key: Mapped[str] = mapped_column(String(80), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    tags_json: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("images.id", ondelete="SET NULL"), nullable=True, index=True)
    position_x: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    position_y: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    is_on_canvas: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="1")
    is_favorite: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    source_type: Mapped[str] = mapped_column(String(24), nullable=False, default="uploaded", server_default="uploaded")
    created_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    project: Mapped[Project | None] = relationship(back_populates="images")


class ImageRelation(Base):
    __tablename__ = "image_relations"
    __table_args__ = (
        UniqueConstraint("source_id", "target_id", name="ux_image_relations_source_target"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_id: Mapped[str] = mapped_column(
        ForeignKey("images.id", ondelete="CASCADE"), index=True, nullable=False
    )
    target_id: Mapped[str] = mapped_column(
        ForeignKey("images.id", ondelete="CASCADE"), index=True, nullable=False
    )
    relation_type: Mapped[str] = mapped_column(
        String(24), nullable=False, default="derived", server_default="derived"
    )
    created_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Prompt(Base):
    __tablename__ = "prompts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(60), nullable=False)
    created_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
