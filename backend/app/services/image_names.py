from pathlib import Path
import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Image


MAX_IMAGE_NAME_LENGTH = 80
_GENERATION_PREFIX = re.compile(r"^\s*(?:(?:请|帮我|请帮我)\s*)?(?:生成|创建|制作)(?:一张|一个)?\s*", re.IGNORECASE)
_NAME_LABEL = re.compile(r"^\s*图片名称\s*[：:]\s*", re.IGNORECASE)
_BACKGROUND_EDIT_TEMPLATE = re.compile(
    r"^\s*\d*\s*(?:移除此图像的背景|移除背景|去除背景|将背景设为透明)",
    re.IGNORECASE,
)
_SURROUNDING_QUOTES = "\"'“”‘’「」『』"


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
    prompt_value = _GENERATION_PREFIX.sub("", unicodedata.normalize("NFKC", prompt))
    prompt_value = prompt_value.replace("@", "").strip()
    if re.fullmatch(r"\d+", prompt_value) or _BACKGROUND_EDIT_TEMPLATE.match(prompt_value):
        return "未命名图片"
    fallback = Path(file_name).stem.strip() or "未命名图片"
    return (prompt_value or fallback)[:MAX_IMAGE_NAME_LENGTH]


def suggested_image_name(value: str | None) -> str | None:
    if value is None:
        return None
    display = unicodedata.normalize("NFKC", value)
    display = re.split(r"[\r\n]", display, maxsplit=1)[0]
    display = _NAME_LABEL.sub("", display).strip()
    display = display.strip(_SURROUNDING_QUOTES).replace("@", "").strip()
    display = display.strip(_SURROUNDING_QUOTES).strip()
    return display[:MAX_IMAGE_NAME_LENGTH] or None


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
    project_id: str | None,
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
    project_id: str | None,
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
