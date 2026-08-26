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

def test_image_name_migration_backfills_unique_rows_idempotently(tmp_path: Path) -> None:
    engine = build_engine(f"sqlite:///{(tmp_path / 'old-images.sqlite').as_posix()}")
    with engine.begin() as connection:
        connection.execute(text(
            """
            CREATE TABLE images (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                image_path TEXT NOT NULL,
                file_name TEXT NOT NULL,
                prompt TEXT NOT NULL,
                tags_json JSON NOT NULL,
                parent_id TEXT NULL,
                position_x FLOAT NOT NULL,
                position_y FLOAT NOT NULL,
                created_time DATETIME NOT NULL
            )
            """
        ))
        connection.execute(text(
            """
            INSERT INTO images VALUES
            ('one', 'project', 'one.png', 'one.png', '生成一张喜羊羊', '[]', NULL, 0, 0, '2026-08-01'),
            ('two', 'project', 'two.png', 'two.png', '生成一张喜羊羊', '[]', NULL, 0, 0, '2026-08-02'),
            ('three', 'project', 'three.png', 'three.png', '', '[]', NULL, 0, 0, '2026-08-03')
            """
        ))

    run_additive_migrations(engine)
    run_additive_migrations(engine)

    columns = {column["name"] for column in inspect(engine).get_columns("images")}
    assert {"name", "name_key"} <= columns
    with engine.connect() as connection:
        rows = connection.execute(text(
            "SELECT name, name_key FROM images ORDER BY created_time"
        )).all()
        indexes = inspect(connection).get_indexes("images")
    assert rows == [("喜羊羊", "喜羊羊"), ("喜羊羊 (2)", "喜羊羊 (2)"), ("three", "three")]
    assert any(index["unique"] and index["column_names"] == ["project_id", "name_key"] for index in indexes)


def test_image_relation_migration_backfills_legacy_parents_idempotently(tmp_path: Path) -> None:
    engine = build_engine(f"sqlite:///{(tmp_path / 'old-relations.sqlite').as_posix()}")
    with engine.begin() as connection:
        connection.execute(text(
            """
            CREATE TABLE images (
                id TEXT PRIMARY KEY, project_id TEXT NOT NULL, image_path TEXT NOT NULL,
                file_name TEXT NOT NULL, prompt TEXT NOT NULL, tags_json JSON NOT NULL,
                parent_id TEXT NULL, position_x FLOAT NOT NULL, position_y FLOAT NOT NULL,
                created_time DATETIME NOT NULL
            )
            """
        ))
        connection.execute(text(
            """
            INSERT INTO images VALUES
            ('source', 'project', 'source.png', 'source.png', '', '[]', NULL, 0, 0, '2026-08-01'),
            ('target', 'project', 'target.png', 'target.png', '', '[]', 'source', 0, 0, '2026-08-02')
            """
        ))

    run_additive_migrations(engine)
    run_additive_migrations(engine)

    assert "image_relations" in inspect(engine).get_table_names()
    with engine.connect() as connection:
        rows = connection.execute(text(
            "SELECT source_id, target_id, relation_type FROM image_relations"
        )).all()
    assert rows == [("source", "target", "derived")]


def test_generation_task_migration_adds_reference_image_ids_json(tmp_path: Path) -> None:
    engine = build_engine(f"sqlite:///{(tmp_path / 'old-task-refs.sqlite').as_posix()}")
    with engine.begin() as connection:
        connection.execute(text(
            """
            CREATE TABLE generation_tasks (
                id TEXT PRIMARY KEY, project_id TEXT NOT NULL, provider TEXT NOT NULL,
                prompt TEXT NOT NULL, parent_image_id TEXT NULL, status TEXT NOT NULL,
                progress_message TEXT NOT NULL, chat_url TEXT NULL, image_id TEXT NULL,
                error_code TEXT NULL, created_time DATETIME NOT NULL, updated_time DATETIME NOT NULL
            )
            """
        ))
        connection.execute(text(
            """
            INSERT INTO generation_tasks (
                id, project_id, provider, prompt, parent_image_id, status,
                progress_message, created_time, updated_time
            ) VALUES (
                'legacy-task', 'project', 'chatgpt-web', 'legacy', 'source-image',
                'queued', 'waiting', '2026-08-01', '2026-08-01'
            )
            """
        ))

    run_additive_migrations(engine)
    run_additive_migrations(engine)

    columns = {column["name"] for column in inspect(engine).get_columns("generation_tasks")}
    assert "reference_image_ids_json" in columns
    with engine.connect() as connection:
        stored = connection.scalar(text(
            "SELECT reference_image_ids_json FROM generation_tasks WHERE id = 'legacy-task'"
        ))
    assert stored == '["source-image"]'


def test_image_source_migration_recovers_completed_chatgpt_outputs(tmp_path: Path) -> None:
    engine = build_engine(f"sqlite:///{(tmp_path / 'source-types.sqlite').as_posix()}")
    with engine.begin() as connection:
        connection.execute(text(
            """
            CREATE TABLE images (
                id TEXT PRIMARY KEY, project_id TEXT NULL, image_path TEXT NOT NULL,
                file_name TEXT NOT NULL, name TEXT NOT NULL, name_key TEXT NOT NULL,
                prompt TEXT NOT NULL, tags_json JSON NOT NULL, parent_id TEXT NULL,
                position_x FLOAT NOT NULL, position_y FLOAT NOT NULL,
                created_time DATETIME NOT NULL, is_on_canvas BOOLEAN NOT NULL DEFAULT 1,
                is_favorite BOOLEAN NOT NULL DEFAULT 0,
                source_type TEXT NOT NULL DEFAULT 'uploaded'
            )
            """
        ))
        connection.execute(text(
            """
            INSERT INTO images VALUES
            ('single', 'project', 'single.png', 'chatgpt-1.png', 'single', 'single',
             'generate one', '[]', NULL, 0, 0, '2026-08-01', 1, 0, 'uploaded'),
            ('batch', 'project', 'batch.png', 'chatgpt-2.png', 'batch', 'batch',
             'generate two', '[]', NULL, 0, 0, '2026-08-02', 1, 0, 'uploaded'),
            ('upload', 'project', 'upload.png', 'photo.png', 'upload', 'upload',
             '', '[]', NULL, 0, 0, '2026-08-03', 1, 0, 'uploaded')
            """
        ))
        connection.execute(text(
            """
            CREATE TABLE generation_tasks (
                id TEXT PRIMARY KEY, project_id TEXT NULL, provider TEXT NOT NULL,
                provider_mode TEXT NOT NULL DEFAULT 'desktop', batch_id TEXT NULL,
                image_ids_json TEXT NOT NULL DEFAULT '[]',
                reference_image_ids_json TEXT NOT NULL DEFAULT '[]',
                attempt INTEGER NOT NULL DEFAULT 1, last_page_url TEXT NULL,
                prompt TEXT NOT NULL, parent_image_id TEXT NULL, status TEXT NOT NULL,
                progress_message TEXT NOT NULL, chat_url TEXT NULL, image_id TEXT NULL,
                error_code TEXT NULL, created_time DATETIME NOT NULL,
                updated_time DATETIME NOT NULL
            )
            """
        ))
        connection.execute(text(
            """
            INSERT INTO generation_tasks VALUES
            ('task-single', 'project', 'chatgpt-web', 'desktop', 'one', '[]', '[]',
             1, NULL, 'generate one', NULL, 'completed', 'done', NULL, 'single',
             NULL, '2026-08-01', '2026-08-01'),
            ('task-batch', 'project', 'chatgpt-web', 'desktop', 'two', '["batch"]', '[]',
             1, NULL, 'generate two', NULL, 'completed', 'done', NULL, NULL,
             NULL, '2026-08-02', '2026-08-02')
            """
        ))

    run_additive_migrations(engine)
    run_additive_migrations(engine)

    with engine.connect() as connection:
        rows = connection.execute(text(
            "SELECT id, source_type FROM images ORDER BY id"
        )).all()
    assert rows == [
        ("batch", "generated"),
        ("single", "generated"),
        ("upload", "uploaded"),
    ]
