from pathlib import Path
import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Image


MAX_IMAGE_NAME_LENGTH = 80
_GENERATION_PREFIX = re.compile(r"^\s*(?:(?:请|帮我|请帮我)\s*)?(?:生成|创建|制作)(?:一张|一个)?\s*", re.IGNORECASE)


class ImageNameValidationError(ValueError):
    pass


class ImageNameConflictError(Exception):
    pass


def normalize_image_name(value: str) -> tuple[str, str]:
    display = unicodedata.normalize("NFKC", value).strip()
    if not display:
        raise ImageNameValidationError("图片名称不能为空")
    if len(display) > MAX_IMAGE_NAME_LENGTH:
        raise ImageNameValidationError("图片名称不能超过 80 个字符")
    return display, display.casefold()


def preferred_image_name(prompt: str, file_name: str) -> str:
    prompt_value = _GENERATION_PREFIX.sub("", unicodedata.normalize("NFKC", prompt)).strip()
    fallback = Path(file_name).stem.strip() or "未命名图片"
    return (prompt_value or fallback)[:MAX_IMAGE_NAME_LENGTH]


def available_name_from_keys(preferred: str, used_keys: set[str]) -> tuple[str, str]:
    base, base_key = normalize_image_name(preferred)
    if base_key not in used_keys:
        return base, base_key
    index = 2
    while True:
        suffix = f" ({index})"
        candidate, key = normalize_image_name(
            f"{base[:MAX_IMAGE_NAME_LENGTH - len(suffix)]}{suffix}"
        )
        if key not in used_keys:
            return candidate, key
        index += 1


def allocate_image_name(
    session: Session,
    project_id: str,
    preferred: str,
    *,
    exclude_id: str | None = None,
) -> tuple[str, str]:
    query = select(Image.name_key).where(Image.project_id == project_id)
    if exclude_id is not None:
        query = query.where(Image.id != exclude_id)
    used_keys = set(session.scalars(query))
    return available_name_from_keys(preferred, used_keys)


def require_available_image_name(
    session: Session,
    project_id: str,
    value: str,
    *,
    exclude_id: str,
) -> tuple[str, str]:
    display, key = normalize_image_name(value)
    existing = session.scalar(
        select(Image.id).where(
            Image.project_id == project_id,
            Image.name_key == key,
            Image.id != exclude_id,
        )
    )
    if existing is not None:
        raise ImageNameConflictError("当前项目已有同名图片")
    return display, key