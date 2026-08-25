from sqlalchemy import Engine, inspect


GENERATION_TASK_COLUMNS = (
    ("provider_mode", "TEXT NOT NULL DEFAULT 'extension'"),
    ("batch_id", "TEXT NULL"),
    ("image_ids_json", "TEXT NOT NULL DEFAULT '[]'"),
    ("attempt", "INTEGER NOT NULL DEFAULT 1"),
    ("last_page_url", "TEXT NULL"),
)


def run_additive_migrations(engine: Engine) -> None:
    """Add desktop generation metadata without rebuilding user tables."""
    if engine.dialect.name != "sqlite":
        return

    with engine.begin() as connection:
        if "generation_tasks" not in inspect(connection).get_table_names():
            return

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
