from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entities import Image, Project, Prompt
from app.schemas.resources import ProjectCreate, ProjectUpdate, PromptCreate, PromptUpdate


class ResourceNotFoundError(Exception):
    pass


class ResourceConflictError(Exception):
    pass


def list_projects(session: Session) -> list[dict]:
    rows = session.execute(
        select(Project, func.count(Image.id))
        .outerjoin(Image)
        .group_by(Project.id)
        .order_by(Project.created_time)
    ).all()
    return [
        {
            "id": project.id,
            "name": project.name,
            "created_time": project.created_time,
            "image_count": image_count,
        }
        for project, image_count in rows
    ]


def create_project(session: Session, payload: ProjectCreate) -> dict:
    project = Project(id=str(uuid4()), name=payload.name, created_time=datetime.now(timezone.utc))
    session.add(project)
    session.commit()
    return {"id": project.id, "name": project.name, "created_time": project.created_time, "image_count": 0}


def update_project(session: Session, project_id: str, payload: ProjectUpdate) -> dict:
    project = session.get(Project, project_id)
    if project is None:
        raise ResourceNotFoundError("项目不存在")
    project.name = payload.name
    session.commit()
    return {"id": project.id, "name": project.name, "created_time": project.created_time, "image_count": len(project.images)}


def delete_project(session: Session, project_id: str) -> None:
    project = session.get(Project, project_id)
    if project is None:
        raise ResourceNotFoundError("项目不存在")
    if session.scalar(select(func.count()).select_from(Project)) <= 1:
        raise ResourceConflictError("至少需要保留一个项目")
    session.delete(project)
    session.commit()


def list_prompts(session: Session) -> list[Prompt]:
    return list(session.scalars(select(Prompt).order_by(Prompt.created_time.desc())))


def create_prompt(session: Session, payload: PromptCreate) -> Prompt:
    prompt = Prompt(id=str(uuid4()), created_time=datetime.now(timezone.utc), **payload.model_dump())
    session.add(prompt)
    session.commit()
    return prompt


def update_prompt(session: Session, prompt_id: str, payload: PromptUpdate) -> Prompt:
    prompt = session.get(Prompt, prompt_id)
    if prompt is None:
        raise ResourceNotFoundError("Prompt 不存在")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(prompt, field, value)
    session.commit()
    return prompt


def duplicate_prompt(session: Session, prompt_id: str) -> Prompt:
    source = session.get(Prompt, prompt_id)
    if source is None:
        raise ResourceNotFoundError("Prompt 不存在")
    duplicate = Prompt(
        id=str(uuid4()),
        title=f"{source.title} 副本",
        content=source.content,
        category=source.category,
        created_time=datetime.now(timezone.utc),
    )
    session.add(duplicate)
    session.commit()
    return duplicate


def delete_prompt(session: Session, prompt_id: str) -> None:
    prompt = session.get(Prompt, prompt_id)
    if prompt is None:
        raise ResourceNotFoundError("Prompt 不存在")
    session.delete(prompt)
    session.commit()
