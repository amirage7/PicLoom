from io import BytesIO
from pathlib import Path
from shutil import copy2, rmtree
from uuid import uuid4

from PIL import Image as PillowImage, UnidentifiedImageError


MAX_IMAGE_BYTES = 20 * 1024 * 1024
FORMAT_EXTENSIONS = {"PNG": ".png", "JPEG": ".jpg", "WEBP": ".webp"}


class ImageStorageError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def _project_directory(images_root: Path, project_id: str) -> Path:
    root = images_root.resolve()
    directory = (root / project_id).resolve()
    if root not in directory.parents:
        raise ImageStorageError("非法项目路径")
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def store_image(images_root: Path, project_id: str, content: bytes) -> Path:
    if len(content) > MAX_IMAGE_BYTES:
        raise ImageStorageError("图片不能超过 20 MB", status_code=413)
    try:
        with PillowImage.open(BytesIO(content)) as image:
            image.verify()
            format_name = image.format
    except (UnidentifiedImageError, OSError, SyntaxError) as error:
        raise ImageStorageError("文件不是有效的 PNG、JPG 或 WEBP 图片") from error
    extension = FORMAT_EXTENSIONS.get(format_name or "")
    if extension is None:
        raise ImageStorageError("仅支持 PNG、JPG 和 WEBP")

    directory = _project_directory(images_root, project_id)
    identifier = str(uuid4())
    temporary = directory / f".{identifier}.tmp"
    final = directory / f"{identifier}{extension}"
    try:
        temporary.write_bytes(content)
        temporary.replace(final)
    finally:
        temporary.unlink(missing_ok=True)
    return final


def duplicate_image(images_root: Path, project_id: str, source: Path) -> Path:
    if not source.is_file():
        raise ImageStorageError("原始图片文件不存在", status_code=500)
    directory = _project_directory(images_root, project_id)
    destination = directory / f"{uuid4()}{source.suffix.lower()}"
    copy2(source, destination)
    return destination


def resolve_stored_path(data_dir: Path, relative_path: str) -> Path:
    root = data_dir.resolve()
    path = (root / Path(relative_path)).resolve()
    if root not in path.parents:
        raise ImageStorageError("非法图片路径", status_code=500)
    return path


def remove_image(data_dir: Path, relative_path: str) -> None:
    resolve_stored_path(data_dir, relative_path).unlink(missing_ok=True)

def remove_project_directory(images_root: Path, project_id: str) -> None:
    root = images_root.resolve()
    directory = (root / project_id).resolve()
    if root not in directory.parents:
        raise ImageStorageError("非法项目路径", status_code=500)
    if directory.exists():
        rmtree(directory)
