from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from io import BytesIO
import json
import os
from pathlib import Path
from shutil import rmtree
from uuid import uuid4

from PIL import Image as PillowImage, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Image
from app.models.generation import GenerationTask
from app.services.image_names import available_name_from_keys, preferred_image_name
from app.services.image_storage import (
    FORMAT_EXTENSIONS,
    ImageStorageError,
    MAX_IMAGE_BYTES,
    resolve_stored_path,
)
from app.services.resources import ResourceNotFoundError


MAX_BATCH_BYTES = 80 * 1024 * 1024


@dataclass(frozen=True)
class BatchFile:
    file_name: str
    content: bytes


@dataclass(frozen=True)
class BatchResult:
    task_id: str
    batch_id: str
    image_ids: list[str]
    deduplicated_count: int


@dataclass(frozen=True)
class ValidatedFile:
    file_name: str
    content: bytes
    digest: str
    extension: str


def _validate(files: list[BatchFile]) -> list[ValidatedFile]:
    if not files:
        raise ImageStorageError("至少需要一张图片")
    if sum(len(item.content) for item in files) > MAX_BATCH_BYTES:
        raise ImageStorageError("单批图片总大小不能超过 80 MB", status_code=413)

    validated: list[ValidatedFile] = []
    for item in files:
        if len(item.content) > MAX_IMAGE_BYTES:
            raise ImageStorageError("图片不能超过 20 MB", status_code=413)
        try:
            with PillowImage.open(BytesIO(item.content)) as image:
                image.verify()
                extension = FORMAT_EXTENSIONS.get(image.format or "")
        except (UnidentifiedImageError, OSError, SyntaxError) as error:
            raise ImageStorageError("批次中包含无效图片") from error
        if extension is None:
            raise ImageStorageError("仅支持 PNG、JPG 和 WEBP")
        validated.append(ValidatedFile(
            file_name=item.file_name,
            content=item.content,
            digest=sha256(item.content).hexdigest(),
            extension=extension,
        ))
    return validated


def _existing_by_digest(session: Session, data_dir: Path, project_id: str) -> dict[str, Image]:
    result: dict[str, Image] = {}
    images = session.scalars(
        select(Image).where(Image.project_id == project_id).order_by(Image.created_time)
    ).all()
    for image in images:
        path = resolve_stored_path(data_dir, image.image_path)
        if path.is_file():
            result.setdefault(sha256(path.read_bytes()).hexdigest(), image)
    return result


def _positions(parent: Image | None, count: int) -> list[tuple[float, float]]:
    if parent is not None:
        return [
            (parent.position_x + (index - (count - 1) / 2) * 320, parent.position_y + 360)
            for index in range(count)
        ]
    columns = min(3, max(1, count))
    return [
        ((index % columns - (columns - 1) / 2) * 320, (index // columns) * 360)
        for index in range(count)
    ]


def complete_task(
    session: Session,
    data_dir: Path,
    task_id: str,
    batch_id: str,
    source_url: str,
    files: list[BatchFile],
) -> BatchResult:
    task = session.get(GenerationTask, task_id)
    if task is None:
        raise ResourceNotFoundError("生成任务不存在")
    normalized_batch_id = batch_id.strip()
    if not normalized_batch_id or len(normalized_batch_id) > 64:
        raise ValueError("无效批次编号")

    if task.batch_id == normalized_batch_id and task.image_ids_json != "[]":
        image_ids = json.loads(task.image_ids_json)
        return BatchResult(task.id, normalized_batch_id, image_ids, max(0, len(files) - len(set(image_ids))))
    if task.status == "cancelled":
        raise ValueError("已取消的任务不能导入图片")
    if task.status == "completed":
        raise ValueError("任务已由其他批次完成")

    validated = _validate(files)
    existing = _existing_by_digest(session, data_dir, task.project_id)
    unique_new = []
    seen_new: set[str] = set()
    for item in validated:
        if item.digest not in existing and item.digest not in seen_new:
            unique_new.append(item)
            seen_new.add(item.digest)

    parent = session.get(Image, task.parent_image_id) if task.parent_image_id else None
    positions = _positions(parent, len(unique_new))
    project_dir = data_dir / "images" / task.project_id
    project_dir.mkdir(parents=True, exist_ok=True)
    staging = project_dir / f".batch-{uuid4()}"
    staging.mkdir()
    new_by_digest: dict[str, Image] = {}
    final_paths: list[Path] = []

    try:
        now = datetime.now(timezone.utc)
        used_name_keys = set(session.scalars(
            select(Image.name_key).where(Image.project_id == task.project_id)
        ))
        for index, item in enumerate(unique_new):
            image_id = str(uuid4())
            staged_path = staging / f"{image_id}{item.extension}"
            staged_path.write_bytes(item.content)
            final_path = project_dir / staged_path.name
            x, y = positions[index]
            name, name_key = available_name_from_keys(
                preferred_image_name(task.prompt, item.file_name), used_name_keys
            )
            used_name_keys.add(name_key)
            image = Image(
                id=image_id,
                project_id=task.project_id,
                image_path=final_path.relative_to(data_dir).as_posix(),
                file_name=item.file_name[:255] or f"chatgpt{item.extension}",
                name=name,
                name_key=name_key,
                prompt=task.prompt,
                tags_json=[],
                parent_id=task.parent_image_id,
                position_x=x,
                position_y=y,
                created_time=now,
            )
            session.add(image)
            new_by_digest[item.digest] = image

        ordered_ids = [
            (existing.get(item.digest) or new_by_digest[item.digest]).id
            for item in validated
        ]
        session.flush()
        for staged_path in staging.iterdir():
            final_path = project_dir / staged_path.name
            os.replace(staged_path, final_path)
            final_paths.append(final_path)

        task.provider_mode = "desktop"
        task.batch_id = normalized_batch_id
        task.image_ids_json = json.dumps(ordered_ids)
        task.image_id = ordered_ids[0]
        task.status = "completed"
        task.progress_message = f"已导入 {len(ordered_ids)} 张图片"
        task.chat_url = source_url[:1024]
        task.last_page_url = source_url[:2048]
        task.updated_time = now
        session.commit()
        return BatchResult(
            task_id=task.id,
            batch_id=normalized_batch_id,
            image_ids=ordered_ids,
            deduplicated_count=len(validated) - len(unique_new),
        )
    except Exception:
        session.rollback()
        for path in final_paths:
            path.unlink(missing_ok=True)
        raise
    finally:
        rmtree(staging, ignore_errors=True)
