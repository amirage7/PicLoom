from collections.abc import Iterator
from pathlib import Path
from io import BytesIO

import pytest
from fastapi.testclient import TestClient

from PIL import Image as PillowImage
from app.core.config import Settings
from app.main import create_app


@pytest.fixture
def data_root(tmp_path: Path) -> Path:
    return tmp_path / "data"

@pytest.fixture
def image_bytes():
    def create(format_name: str = "PNG") -> bytes:
        output = BytesIO()
        PillowImage.new("RGB", (8, 6), color=(42, 96, 88)).save(output, format=format_name)
        return output.getvalue()

    return create



@pytest.fixture
def client(data_root: Path) -> Iterator[TestClient]:
    settings = Settings(data_dir=data_root)
    with TestClient(create_app(settings)) as test_client:
        yield test_client
