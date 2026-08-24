from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Image, Project
from app.schemas.images import ImageUpdate
from app.services.image_storage import duplicate_image, remove_image, resolve_stored_path, store_image
from app.services.resources import ResourceNotFoundError


class ImageRelationshipError(Exception):
    pass


def serialize_image(image: Image) -> dict:
    return {
        "id": image.id,
        "project_id": image.project_id,
        "image_path": image.image_path,
        "image_url": f"/media/{image.image_path.replace('\\', '/')}",
        "file_name": image.file_name,
        "prompt": image.prompt,
        "tags": image.tags_json,
        "parent_id": image.parent_id,
        "position_x": image.position_x,
        "position_y": image.position_y,
        "created_time": image.created_time,
    }


def list_images(session: Session, project_id: str) -> list[dict]:
    if session.get(Project, project_id) is None:
        raise ResourceNotFoundError("项目不存在")
    images = session.scalars(
        select(Image).where(Image.project_id == project_id).order_by(Image.created_time)
    ).all()
    return [serialize_image(image) for image in images]


def create_image(
    session: Session,
    data_dir: Path,
    project_id: str,
    content: bytes,
    file_name: str,
    prompt: str,
    position_x: float,
    position_y: float,
    parent_id: str | None,
) -> dict:
    if session.get(Project, project_id) is None:
        raise ResourceNotFoundError("项目不存在")
    image_id = str(uuid4())
    if parent_id is not None:
        validate_parent(session, image_id, project_id, parent_id)
    stored = store_image(data_dir / "images", project_id, content)
    relative = stored.relative_to(data_dir).as_posix()
    image = Image(
        id=image_id,
        project_id=project_id,
        image_path=relative,
        file_name=Path(file_name).name[:255] or "image",
        prompt=prompt,
        tags_json=[],
        parent_id=parent_id,
        position_x=position_x,
        position_y=position_y,
        created_time=datetime.now(timezone.utc),
    )
    try:
        session.add(image)
        session.commit()
    except Exception:
        session.rollback()
        stored.unlink(missing_ok=True)
        raise
    return serialize_image(image)


def validate_parent(session: Session, image_id: str, project_id: str, parent_id: str) -> None:
    if parent_id == image_id:
        raise ImageRelationshipError("图片不能连接到自己")
    parent = session.get(Image, parent_id)
    if parent is None:
        raise ImageRelationshipError("父版本不存在")
    if parent.project_id != project_id:
        raise ImageRelationshipError("父子版本必须属于同一项目")
    visited: set[str] = set()
    current: Image | None = parent
    while current is not None:
        if current.id == image_id:
            raise ImageRelationshipError("版本关系不能形成循环")
        if current.id in visited:
            raise ImageRelationshipError("已有版本关系包含循环")
        visited.add(current.id)
        current = session.get(Image, current.parent_id) if current.parent_id else None


def update_image(session: Session, image_id: str, payload: ImageUpdate) -> dict:
    image = session.get(Image, image_id)
    if image is None:
        raise ResourceNotFoundError("图片不存在")
    fields = payload.model_fields_set
    if "parent_id" in fields and payload.parent_id is not None:
        validate_parent(session, image.id, image.project_id, payload.parent_id)
    if "prompt" in fields:
        image.prompt = payload.prompt or ""
    if "tags" in fields:
        image.tags_json = list(dict.fromkeys(tag.strip() for tag in (payload.tags or []) if tag.strip()))
    if "parent_id" in fields:
        image.parent_id = payload.parent_id
    if "position_x" in fields and payload.position_x is not None:
        image.position_x = payload.position_x
    if "position_y" in fields and payload.position_y is not None:
        image.position_y = payload.position_y
    session.commit()
    return serialize_image(image)


def copy_image(session: Session, data_dir: Path, image_id: str) -> dict:
    source = session.get(Image, image_id)
    if source is None:
        raise ResourceNotFoundError("图片不存在")
    stored = duplicate_image(data_dir / "images", source.project_id, resolve_stored_path(data_dir, source.image_path))
    duplicate = Image(
        id=str(uuid4()),
        project_id=source.project_id,
        image_path=stored.relative_to(data_dir).as_posix(),
        file_name=source.file_name,
        prompt=source.prompt,
        tags_json=list(source.tags_json),
        parent_id=None,
        position_x=source.position_x + 60,
        position_y=source.position_y + 60,
        created_time=datetime.now(timezone.utc),
    )
    try:
        session.add(duplicate)
        session.commit()
    except Exception:
        session.rollback()
        stored.unlink(missing_ok=True)
        raise
    return serialize_image(duplicate)


def delete_image(session: Session, data_dir: Path, image_id: str) -> None:
    image = session.get(Image, image_id)
    if image is None:
        raise ResourceNotFoundError("图片不存在")
    image_path = image.image_path
    session.delete(image)
    session.commit()
    remove_image(data_dir, image_path)
