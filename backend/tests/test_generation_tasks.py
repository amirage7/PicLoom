from datetime import datetime, timezone

import pytest

from app.models.entities import Project
from app.services import generation_tasks


def create_project_session(client):
    session = client.app.state.session_factory()
    project = Project(id="project-1", name="Test project", created_time=datetime.now(timezone.utc))
    session.add(project)
    session.commit()
    return session, project


def test_generation_task_starts_queued(client):
    session, project = create_project_session(client)
    try:
        task = generation_tasks.create_task(session, project.id, "draw a quiet observatory", None)
        assert task.status == "queued"
        assert task.provider == "chatgpt-web"
    finally:
        session.close()


def test_generation_task_rejects_invalid_transition(client):
    session, project = create_project_session(client)
    try:
        task = generation_tasks.create_task(session, project.id, "draw a quiet observatory", None)
        with pytest.raises(generation_tasks.InvalidTaskTransition):
            generation_tasks.transition(session, task.id, "completed", "done")
    finally:
        session.close()
