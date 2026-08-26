from sqlalchemy import Engine, inspect

from app.services.image_names import available_name_from_keys, preferred_image_name


GENERATION_TASK_COLUMNS = (
    ("provider_mode", "TEXT NOT NULL DEFAULT 'extension'"),
    ("batch_id", "TEXT NULL"),
    ("image_ids_json", "TEXT NOT NULL DEFAULT '[]'"),
    ("reference_image_ids_json", "TEXT NOT NULL DEFAULT '[]'"),
    ("attempt", "INTEGER NOT NULL DEFAULT 1"),
    ("last_page_url", "TEXT NULL"),
)


def _migrate_generation_tasks(connection) -> None:
    for column_name, definition in GENERATION_TASK_COLUMNS:
        existing = {
            column["name"]
            for column in inspect(connection).get_columns("generation_tasks")
        }
        if column_name in existing:
            continue
        connection.exec_driver_sql(
            f'ALTER TABLE "generation_tasks" ADD COLUMN "{column_name}" {definition}'
        )
    connection.exec_driver_sql(
        """
        UPDATE generation_tasks
        SET reference_image_ids_json = json_array(parent_image_id)
        WHERE parent_image_id IS NOT NULL
          AND reference_image_ids_json = '[]'
        """
    )


def _migrate_image_names(connection) -> None:
    existing = {column["name"] for column in inspect(connection).get_columns("images")}
    if "name" not in existing:
        connection.exec_driver_sql('ALTER TABLE "images" ADD COLUMN "name" TEXT NULL')
    if "name_key" not in existing:
        connection.exec_driver_sql('ALTER TABLE "images" ADD COLUMN "name_key" TEXT NULL')

    rows = connection.exec_driver_sql(
        "SELECT id, project_id, file_name, prompt, name FROM images ORDER BY created_time, id"
    ).mappings().all()
    used_by_project: dict[str, set[str]] = {}
    for row in rows:
        used = used_by_project.setdefault(row["project_id"], set())
        preferred = row["name"] or preferred_image_name(row["prompt"] or "", row["file_name"] or "")
        name, name_key = available_name_from_keys(preferred, used)
        used.add(name_key)
        connection.exec_driver_sql(
            "UPDATE images SET name = ?, name_key = ? WHERE id = ?",
            (name, name_key, row["id"]),
        )

    connection.exec_driver_sql(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_images_project_name_key "
        "ON images (project_id, name_key)"
    )


def _migrate_image_relations(connection) -> None:
    connection.exec_driver_sql(
        """
        CREATE TABLE IF NOT EXISTS image_relations (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
            target_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
            relation_type TEXT NOT NULL DEFAULT 'derived',
            created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT ux_image_relations_source_target UNIQUE (source_id, target_id)
        )
        """
    )
    connection.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_image_relations_source_id ON image_relations (source_id)"
    )
    connection.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_image_relations_target_id ON image_relations (target_id)"
    )
    connection.exec_driver_sql(
        """
        INSERT OR IGNORE INTO image_relations (
            id, source_id, target_id, relation_type, created_time
        )
        SELECT
            'legacy-' || id, parent_id, id, 'derived', created_time
        FROM images
        WHERE parent_id IS NOT NULL
        """
    )


def _backfill_generated_source_types(connection) -> None:
    tables = set(inspect(connection).get_table_names())
    if "images" not in tables or "generation_tasks" not in tables:
        return
    image_columns = {column["name"] for column in inspect(connection).get_columns("images")}
    task_columns = {column["name"] for column in inspect(connection).get_columns("generation_tasks")}
    if "source_type" not in image_columns or not {"status", "image_id", "image_ids_json"} <= task_columns:
        return
    connection.exec_driver_sql(
        """
        UPDATE images
        SET source_type = 'generated'
        WHERE id IN (
            SELECT image_id
            FROM generation_tasks
            WHERE status = 'completed' AND image_id IS NOT NULL
            UNION
            SELECT json_each.value
            FROM generation_tasks
            JOIN json_each(
                CASE
                    WHEN json_valid(generation_tasks.image_ids_json)
                    THEN generation_tasks.image_ids_json
                    ELSE '[]'
                END
            )
            WHERE generation_tasks.status = 'completed'
        )
        """
    )


def _make_project_ids_nullable(connection) -> None:
    image_columns = {column["name"]: column for column in inspect(connection).get_columns("images")}
    if image_columns.get("project_id", {}).get("nullable") is False:
        connection.exec_driver_sql("CREATE TEMP TABLE images_backup AS SELECT * FROM images")
        connection.exec_driver_sql("DROP TABLE images")
        connection.exec_driver_sql(
            """
            CREATE TABLE images (
                id VARCHAR(64) NOT NULL PRIMARY KEY,
                project_id VARCHAR(64) REFERENCES projects(id) ON DELETE CASCADE,
                image_path VARCHAR(512) NOT NULL UNIQUE,
                file_name VARCHAR(255) NOT NULL,
                name VARCHAR(80) NOT NULL,
                name_key VARCHAR(80) NOT NULL,
                prompt TEXT NOT NULL DEFAULT '',
                tags_json JSON NOT NULL DEFAULT '[]',
                parent_id VARCHAR(64) REFERENCES images(id) ON DELETE SET NULL,
                position_x FLOAT NOT NULL DEFAULT 0,
                position_y FLOAT NOT NULL DEFAULT 0,
                created_time DATETIME NOT NULL,
                is_on_canvas BOOLEAN NOT NULL DEFAULT 1,
                is_favorite BOOLEAN NOT NULL DEFAULT 0,
                source_type VARCHAR(24) NOT NULL DEFAULT 'uploaded'
            )
            """
        )
        backup_columns = {column["name"] for column in inspect(connection).get_columns("images_backup")}
        common = [name for name in (
            "id", "project_id", "image_path", "file_name", "name", "name_key", "prompt",
            "tags_json", "parent_id", "position_x", "position_y", "created_time",
            "is_on_canvas", "is_favorite", "source_type",
        ) if name in backup_columns]
        names = ", ".join(f'"{name}"' for name in common)
        connection.exec_driver_sql(f"INSERT INTO images ({names}) SELECT {names} FROM images_backup")
        connection.exec_driver_sql("DROP TABLE images_backup")
        connection.exec_driver_sql("CREATE INDEX ix_images_project_id ON images (project_id)")
        connection.exec_driver_sql("CREATE INDEX ix_images_parent_id ON images (parent_id)")
        connection.exec_driver_sql("CREATE UNIQUE INDEX ux_images_project_name_key ON images (project_id, name_key)")

    if "generation_tasks" not in inspect(connection).get_table_names():
        return
    task_columns = {column["name"]: column for column in inspect(connection).get_columns("generation_tasks")}
    if task_columns.get("project_id", {}).get("nullable") is not False:
        return
    connection.exec_driver_sql("CREATE TEMP TABLE generation_tasks_backup AS SELECT * FROM generation_tasks")
    connection.exec_driver_sql("DROP TABLE generation_tasks")
    connection.exec_driver_sql(
        """
        CREATE TABLE generation_tasks (
            id VARCHAR(64) NOT NULL PRIMARY KEY,
            project_id VARCHAR(64) REFERENCES projects(id) ON DELETE CASCADE,
            provider VARCHAR(64) NOT NULL,
            provider_mode VARCHAR(24) NOT NULL DEFAULT 'extension',
            batch_id VARCHAR(64),
            image_ids_json TEXT NOT NULL DEFAULT '[]',
            reference_image_ids_json TEXT NOT NULL DEFAULT '[]',
            attempt INTEGER NOT NULL DEFAULT 1,
            last_page_url VARCHAR(2048),
            prompt TEXT NOT NULL,
            parent_image_id VARCHAR(64) REFERENCES images(id) ON DELETE SET NULL,
            status VARCHAR(24) NOT NULL,
            progress_message VARCHAR(255) NOT NULL,
            chat_url VARCHAR(1024),
            image_id VARCHAR(64) REFERENCES images(id) ON DELETE SET NULL,
            error_code VARCHAR(64),
            created_time DATETIME NOT NULL,
            updated_time DATETIME NOT NULL
        )
        """
    )
    names = ", ".join(f'"{name}"' for name in task_columns)
    connection.exec_driver_sql(f"INSERT INTO generation_tasks ({names}) SELECT {names} FROM generation_tasks_backup")
    connection.exec_driver_sql("DROP TABLE generation_tasks_backup")
    connection.exec_driver_sql("CREATE INDEX ix_generation_tasks_project_id ON generation_tasks (project_id)")
    connection.exec_driver_sql("CREATE INDEX ix_generation_tasks_status ON generation_tasks (status)")


def run_additive_migrations(engine: Engine) -> None:
    """Add local desktop metadata without rebuilding user tables."""
    if engine.dialect.name != "sqlite":
        return

    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.commit()
        transaction = connection.begin()
        tables = set(inspect(connection).get_table_names())
        if "generation_tasks" in tables:
            _migrate_generation_tasks(connection)
        if "images" in tables:
            _migrate_image_names(connection)
            existing = {column["name"] for column in inspect(connection).get_columns("images")}
            if "is_on_canvas" not in existing:
                connection.exec_driver_sql("ALTER TABLE images ADD COLUMN is_on_canvas BOOLEAN NOT NULL DEFAULT 1")
            if "is_favorite" not in existing:
                connection.exec_driver_sql("ALTER TABLE images ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT 0")
            if "source_type" not in existing:
                connection.exec_driver_sql("ALTER TABLE images ADD COLUMN source_type VARCHAR(24) NOT NULL DEFAULT 'uploaded'")
            _backfill_generated_source_types(connection)
            _make_project_ids_nullable(connection)
            _migrate_image_relations(connection)
        transaction.commit()
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        connection.commit()
