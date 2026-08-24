from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


@pytest.fixture
def data_root(tmp_path: Path) -> Path:
    return tmp_path / "data"


@pytest.fixture
def client(data_root: Path) -> Iterator[TestClient]:
    settings = Settings(data_dir=data_root)
    with TestClient(create_app(settings)) as test_client:
        yield test_client
