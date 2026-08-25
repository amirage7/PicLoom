from sqlalchemy import Engine, inspect

from app.services.image_names import available_name_from_keys, preferred_image_name


GENERATION_TASK_COLUMNS = (
    ("provider_mode", "TEXT NOT NULL DEFAULT 'extension'"),
    ("batch_id", "TEXT NULL"),
    ("image_ids_json", "TEXT NOT NULL DEFAULT '[]'"),
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


def run_additive_migrations(engine: Engine) -> None:
    """Add local desktop metadata without rebuilding user tables."""
    if engine.dialect.name != "sqlite":
        return

    with engine.begin() as connection:
        tables = set(inspect(connection).get_table_names())
        if "generation_tasks" in tables:
            _migrate_generation_tasks(connection)
        if "images" in tables:
            _migrate_image_names(connection)