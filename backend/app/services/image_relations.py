from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.entities import Image, ImageRelation
from app.services.resources import ResourceNotFoundError


class ImageRelationshipError(Exception):
    pass


def source_ids_for_target(session: Session, target_id: str) -> list[str]:
    return list(session.scalars(
        select(ImageRelation.source_id)
        .where(ImageRelation.target_id == target_id)
        .order_by(ImageRelation.created_time, ImageRelation.id)
    ))


def source_ids_by_target(
    session: Session, target_ids: list[str]
) -> dict[str, list[str]]:
    grouped = {target_id: [] for target_id in target_ids}
    if not target_ids:
        return grouped
    rows = session.execute(
        select(ImageRelation.target_id, ImageRelation.source_id)
        .where(ImageRelation.target_id.in_(target_ids))
        .order_by(
            ImageRelation.target_id,
            ImageRelation.created_time,
            ImageRelation.id,
        )
    ).all()
    for target_id, source_id in rows:
        grouped[target_id].append(source_id)
    return grouped


def _validate_endpoints(session: Session, source_id: str, target_id: str) -> tuple[Image, Image]:
    if source_id == target_id:
        raise ImageRelationshipError("图片不能连接到自己")
    source = session.get(Image, source_id)
    target = session.get(Image, target_id)
    if source is None or target is None:
        raise ResourceNotFoundError("关系中的图片不存在")
    if source.project_id != target.project_id:
        raise ImageRelationshipError("图片关系必须属于同一项目")
    return source, target


def _validate_acyclic(session: Session, source_id: str, target_id: str) -> None:
    pending = [target_id]
    visited: set[str] = set()
    while pending:
        current = pending.pop()
        if current == source_id:
            raise ImageRelationshipError("图片关系不能形成循环")
        if current in visited:
            continue
        visited.add(current)
        pending.extend(session.scalars(
            select(ImageRelation.target_id).where(ImageRelation.source_id == current)
        ))


def create_relation(
    session: Session,
    source_id: str,
    target_id: str,
    *,
    commit: bool = True,
) -> ImageRelation:
    existing = session.scalar(
        select(ImageRelation).where(
            ImageRelation.source_id == source_id,
            ImageRelation.target_id == target_id,
        )
    )
    if existing is not None:
        return existing
    _validate_endpoints(session, source_id, target_id)
    _validate_acyclic(session, source_id, target_id)
    relation = ImageRelation(
        id=str(uuid4()),
        source_id=source_id,
        target_id=target_id,
        relation_type="derived",
        created_time=datetime.now(timezone.utc),
    )
    try:
        with session.begin_nested():
            session.add(relation)
            session.flush()
    except IntegrityError as error:
        concurrent = session.scalar(
            select(ImageRelation).where(
                ImageRelation.source_id == source_id,
                ImageRelation.target_id == target_id,
            )
        )
        if concurrent is None:
            raise error
        if commit:
            session.commit()
        return concurrent
    target = session.get(Image, target_id)
    if target is not None and target.parent_id is None:
        target.parent_id = source_id
    if commit:
        session.commit()
        session.refresh(relation)
    return relation


def delete_relation(
    session: Session,
    source_id: str,
    target_id: str,
    *,
    commit: bool = True,
) -> bool:
    relation = session.scalar(
        select(ImageRelation).where(
            ImageRelation.source_id == source_id,
            ImageRelation.target_id == target_id,
        )
    )
    if relation is None:
        return False
    session.delete(relation)
    session.flush()
    target = session.get(Image, target_id)
    if target is not None:
        target.parent_id = next(iter(source_ids_for_target(session, target_id)), None)
    if commit:
        session.commit()
    return True


def replace_sources(
    session: Session,
    target_id: str,
    source_ids: list[str],
    *,
    commit: bool = True,
) -> None:
    session.execute(delete(ImageRelation).where(ImageRelation.target_id == target_id))
    target = session.get(Image, target_id)
    if target is None:
        raise ResourceNotFoundError("图片不存在")
    target.parent_id = None
    session.flush()
    for source_id in source_ids:
        create_relation(session, source_id, target_id, commit=False)
    target.parent_id = source_ids[0] if source_ids else None
    if commit:
        session.commit()


def serialize_relation(relation: ImageRelation) -> dict:
    return {
        "id": relation.id,
        "source_id": relation.source_id,
        "target_id": relation.target_id,
        "relation_type": relation.relation_type,
        "created_time": relation.created_time,
    }
