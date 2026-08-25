from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy import inspect, text

from app.db.session import build_engine
from app.schemas.generation import DesktopTaskStateUpdate
from app.services.database_migrations import run_additive_migrations


DESKTOP_STATES = (
    "opening_chatgpt",
    "login_required",
    "ready",
    "collecting",
    "importing",
    "refused",
    "rate_limited",
    "page_changed",
)


def test_generation_task_migration_is_idempotent_and_preserves_rows(tmp_path: Path) -> None:
    engine = build_engine(f"sqlite:///{(tmp_path / 'old.sqlite').as_posix()}")
    with engine.begin() as connection:
        connection.execute(text(
            """
            CREATE TABLE generation_tasks (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                prompt TEXT NOT NULL,
                parent_image_id TEXT NULL,
                status TEXT NOT NULL,
                progress_message TEXT NOT NULL,
                chat_url TEXT NULL,
                image_id TEXT NULL,
                error_code TEXT NULL,
                created_time DATETIME NOT NULL,
                updated_time DATETIME NOT NULL
            )
            """
        ))
        connection.execute(text(
            """
            INSERT INTO generation_tasks (
                id, project_id, provider, prompt, status, progress_message,
                created_time, updated_time
            ) VALUES (
                'task-old', 'project-old', 'chatgpt-web', 'keep me',
                'queued', 'waiting', '2026-08-01', '2026-08-01'
            )
            """
        ))

    run_additive_migrations(engine)
    run_additive_migrations(engine)

    columns = {column["name"] for column in inspect(engine).get_columns("generation_tasks")}
    assert {"provider_mode", "batch_id", "image_ids_json", "attempt", "last_page_url"} <= columns
    with engine.connect() as connection:
        row = connection.execute(text(
            "SELECT id, prompt, provider_mode, batch_id, image_ids_json, attempt, last_page_url "
            "FROM generation_tasks WHERE id = 'task-old'"
        )).mappings().one()
    assert dict(row) == {
        "id": "task-old",
        "prompt": "keep me",
        "provider_mode": "extension",
        "batch_id": None,
        "image_ids_json": "[]",
        "attempt": 1,
        "last_page_url": None,
    }


@pytest.mark.parametrize("state", DESKTOP_STATES)
def test_desktop_generation_states_are_validated(state: str) -> None:
    assert DesktopTaskStateUpdate(state=state, message="progress").state == state
    with pytest.raises(ValidationError):
        DesktopTaskStateUpdate(state="unknown", message="progress")
