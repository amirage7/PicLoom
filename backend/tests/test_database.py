from pathlib import Path

from sqlalchemy import select, text

from app.db.init_db import init_database
from app.db.session import build_engine, build_session_factory
from app.models.entities import Project, Prompt


def create_test_session(database_path: Path):
    engine = build_engine(f"sqlite:///{database_path.as_posix()}")
    init_database(engine)
    return build_session_factory(engine)()


def test_database_initialization_seeds_stable_resources(tmp_path: Path) -> None:
    with create_test_session(tmp_path / "database.sqlite") as session:
        projects = session.scalars(select(Project).order_by(Project.created_time)).all()
        prompts = session.scalars(select(Prompt)).all()

        assert [item.id for item in projects] == [
            "future-city",
            "product-concepts",
            "architecture",
        ]
        assert len(prompts) == 6


def test_database_initialization_is_idempotent(tmp_path: Path) -> None:
    engine = build_engine(f"sqlite:///{(tmp_path / 'database.sqlite').as_posix()}")
    init_database(engine)
    init_database(engine)

    with build_session_factory(engine)() as session:
        assert len(session.scalars(select(Project)).all()) == 3
        assert len(session.scalars(select(Prompt)).all()) == 6


def test_sqlite_foreign_keys_are_enabled(tmp_path: Path) -> None:
    with create_test_session(tmp_path / "database.sqlite") as session:
        assert session.scalar(text("PRAGMA foreign_keys")) == 1
