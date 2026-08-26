from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Image, ImageRelation, Project
from app.schemas.images import ImageUpdate
from app.services.image_names import (
    allocate_image_name,
    preferred_image_name,
    require_available_image_name,
)
from app.services.image_storage import duplicate_image, move_image, remove_image, resolve_stored_path, store_image
from app.services import image_relations
from app.services.resources import ResourceNotFoundError


ImageRelationshipError = image_relations.ImageRelationshipError


def serialize_image(
    session: Session,
    image: Image,
    source_ids: list[str] | None = None,
) -> dict:
    return {
        "id": image.id,
        "project_id": image.project_id,
        "image_path": image.image_path,
        "image_url": f"/media/{image.image_path.replace('\\', '/')}",
        "file_name": image.file_name,
        "name": image.name,
        "prompt": image.prompt,
        "tags": image.tags_json,
        "parent_id": image.parent_id,
        "source_ids": (
            image_relations.source_ids_for_target(session, image.id)
            if source_ids is None
            else source_ids
        ),
        "position_x": image.position_x,
        "position_y": image.position_y,
        "is_on_canvas": image.is_on_canvas,
        "is_favorite": image.is_favorite,
        "source_type": image.source_type,
        "created_time": image.created_time,
    }


def list_images(session: Session, project_id: str) -> list[dict]:
    if session.get(Project, project_id) is None:
        raise ResourceNotFoundError("项目不存在")
    images = session.scalars(
        select(Image).where(Image.project_id == project_id).order_by(Image.created_time)
    ).all()
    sources_by_target = image_relations.source_ids_by_target(
        session, [image.id for image in images]
    )
    return [
        serialize_image(session, image, sources_by_target[image.id])
        for image in images
    ]


def list_unarchived_images(session: Session) -> list[dict]:
    images = session.scalars(
        select(Image).where(Image.project_id.is_(None)).order_by(Image.created_time.desc())
    ).all()
    sources_by_target = image_relations.source_ids_by_target(session, [image.id for image in images])
    return [serialize_image(session, image, sources_by_target[image.id]) for image in images]


def create_image(
    session: Session,
    data_dir: Path,
    project_id: str | None,
    content: bytes,
    file_name: str,
    prompt: str,
    position_x: float,
    position_y: float,
    parent_id: str | None,
) -> dict:
    if project_id is not None and session.get(Project, project_id) is None:
        raise ResourceNotFoundError("项目不存在")
    image_id = str(uuid4())
    name, name_key = allocate_image_name(
        session, project_id, preferred_image_name("", file_name)
    )
    if parent_id is not None:
        validate_parent(session, image_id, project_id, parent_id)
    stored = store_image(data_dir / "images", project_id, content)
    relative = stored.relative_to(data_dir).as_posix()
    image = Image(
        id=image_id,
        project_id=project_id,
        image_path=relative,
        file_name=Path(file_name).name[:255] or "image",
        name=name,
        name_key=name_key,
        prompt=prompt,
        tags_json=[],
        parent_id=parent_id,
        position_x=position_x,
        position_y=position_y,
        is_on_canvas=project_id is not None,
        is_favorite=False,
        source_type="uploaded",
        created_time=datetime.now(timezone.utc),
    )
    try:
        session.add(image)
        session.flush()
        if parent_id is not None:
            image_relations.create_relation(session, parent_id, image.id, commit=False)
        session.commit()
    except Exception:
        session.rollback()
        stored.unlink(missing_ok=True)
        raise
    return serialize_image(session, image)


def validate_parent(session: Session, image_id: str, project_id: str | None, parent_id: str) -> None:
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


def get_image_file(session: Session, data_dir: Path, image_id: str) -> tuple[Path, str]:
    image = session.get(Image, image_id)
    if image is None:
        raise ResourceNotFoundError("图片不存在")
    return resolve_stored_path(data_dir, image.image_path), image.file_name


def update_image(session: Session, image_id: str, payload: ImageUpdate) -> dict:
    image = session.get(Image, image_id)
    if image is None:
        raise ResourceNotFoundError("图片不存在")
    fields = payload.model_fields_set
    if "project_id" in fields and payload.project_id != image.project_id:
        if payload.project_id is not None and session.get(Project, payload.project_id) is None:
            raise ResourceNotFoundError("目标项目不存在")
        old_path = resolve_stored_path(session.info["data_dir"], image.image_path) if "data_dir" in session.info else None
        if old_path is not None:
            stored = move_image(session.info["data_dir"] / "images", payload.project_id, old_path)
            image.image_path = stored.relative_to(session.info["data_dir"]).as_posix()
        image.project_id = payload.project_id
        image.name, image.name_key = allocate_image_name(session, payload.project_id, image.name, exclude_id=image.id)
        image.is_on_canvas = payload.project_id is not None
        image.parent_id = None
        image_relations.replace_sources(session, image.id, [], commit=False)
    if "parent_id" in fields and payload.parent_id is not None:
        validate_parent(session, image.id, image.project_id, payload.parent_id)
    if "name" in fields:
        image.name, image.name_key = require_available_image_name(
            session, image.project_id, payload.name or "", exclude_id=image.id
        )
    if "prompt" in fields:
        image.prompt = payload.prompt or ""
    if "tags" in fields:
        image.tags_json = list(dict.fromkeys(tag.strip() for tag in (payload.tags or []) if tag.strip()))
    if "parent_id" in fields:
        image_relations.replace_sources(
            session,
            image.id,
            [payload.parent_id] if payload.parent_id is not None else [],
            commit=False,
        )
    if "position_x" in fields and payload.position_x is not None:
        image.position_x = payload.position_x
    if "position_y" in fields and payload.position_y is not None:
        image.position_y = payload.position_y
    if "is_on_canvas" in fields and payload.is_on_canvas is not None:
        image.is_on_canvas = bool(payload.is_on_canvas) and image.project_id is not None
    if "is_favorite" in fields and payload.is_favorite is not None:
        image.is_favorite = payload.is_favorite
    session.commit()
    return serialize_image(session, image)


def copy_image(session: Session, data_dir: Path, image_id: str) -> dict:
    source = session.get(Image, image_id)
    if source is None:
        raise ResourceNotFoundError("图片不存在")
    stored = duplicate_image(data_dir / "images", source.project_id, resolve_stored_path(data_dir, source.image_path))
    name, name_key = allocate_image_name(session, source.project_id, f"{source.name} 副本")
    duplicate = Image(
        id=str(uuid4()),
        project_id=source.project_id,
        image_path=stored.relative_to(data_dir).as_posix(),
        file_name=source.file_name,
        name=name,
        name_key=name_key,
        prompt=source.prompt,
        tags_json=list(source.tags_json),
        parent_id=None,
        position_x=source.position_x + 60,
        position_y=source.position_y + 60,
        is_on_canvas=source.is_on_canvas,
        is_favorite=False,
        source_type=source.source_type,
        created_time=datetime.now(timezone.utc),
    )
    try:
        session.add(duplicate)
        session.commit()
    except Exception:
        session.rollback()
        stored.unlink(missing_ok=True)
        raise
    return serialize_image(session, duplicate)


def delete_image(session: Session, data_dir: Path, image_id: str) -> None:
    image = session.get(Image, image_id)
    if image is None:
        raise ResourceNotFoundError("图片不存在")
    image_path = image.image_path
    affected_target_ids = list(session.scalars(
        select(ImageRelation.target_id).where(ImageRelation.source_id == image_id)
    ))
    session.delete(image)
    session.flush()
    for target_id in affected_target_ids:
        target = session.get(Image, target_id)
        if target is not None:
            target.parent_id = next(iter(
                image_relations.source_ids_for_target(session, target_id)
            ), None)
    session.commit()
    remove_image(data_dir, image_path)
