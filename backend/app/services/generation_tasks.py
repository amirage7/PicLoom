from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Image, Project
from app.models.generation import GenerationTask
from app.services.resources import ResourceNotFoundError


TERMINAL_STATUSES = {"completed", "failed", "cancelled"}
ACTIVE_STATUSES = {"connecting", "sending", "generating", "downloading"}
ALLOWED_TRANSITIONS = {
    "queued": {"connecting", "cancelled"},
    "connecting": {"sending", "failed", "cancelled"},
    "sending": {"generating", "failed", "cancelled"},
    "generating": {"downloading", "failed", "cancelled"},
    "downloading": {"completed", "failed", "cancelled"},
    "completed": set(),
    "failed": set(),
    "cancelled": set(),
}


class InvalidTaskTransition(Exception):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_task(session: Session, project_id: str, prompt: str, parent_image_id: str | None) -> GenerationTask:
    normalized_prompt = prompt.strip()
    if not normalized_prompt:
        raise ValueError("Prompt 不能为空")
    if session.get(Project, project_id) is None:
        raise ResourceNotFoundError("项目不存在")
    if parent_image_id is not None:
        parent = session.get(Image, parent_image_id)
        if parent is None or parent.project_id != project_id:
            raise ValueError("父图片必须属于当前项目")
    now = _now()
    task = GenerationTask(
        id=str(uuid4()), project_id=project_id, provider="chatgpt-web",
        prompt=normalized_prompt, parent_image_id=parent_image_id,
        status="queued", progress_message="等待扩展连接",
        created_time=now, updated_time=now,
    )
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


def get_task(session: Session, task_id: str) -> GenerationTask:
    task = session.get(GenerationTask, task_id)
    if task is None:
        raise ResourceNotFoundError("生成任务不存在")
    return task


def transition(session: Session, task_id: str, status: str, progress_message: str, error_code: str | None = None, chat_url: str | None = None) -> GenerationTask:
    task = get_task(session, task_id)
    if status not in ALLOWED_TRANSITIONS.get(task.status, set()):
        raise InvalidTaskTransition(f"无法从 {task.status} 切换到 {status}")
    task.status = status
    task.progress_message = progress_message[:255]
    task.error_code = error_code
    if chat_url is not None:
        task.chat_url = chat_url[:1024]
    task.updated_time = _now()
    session.commit()
    session.refresh(task)
    return task


def claim_next_task(session: Session) -> GenerationTask | None:
    active = session.scalar(select(GenerationTask).where(GenerationTask.status.in_(ACTIVE_STATUSES)).order_by(GenerationTask.created_time))
    if active is not None:
        return active
    queued = session.scalar(select(GenerationTask).where(GenerationTask.status == "queued").order_by(GenerationTask.created_time))
    if queued is None:
        return None
    return transition(session, queued.id, "connecting", "正在连接 ChatGPT")


def cancel_task(session: Session, task_id: str) -> GenerationTask:
    task = get_task(session, task_id)
    if task.status in TERMINAL_STATUSES:
        raise InvalidTaskTransition("任务已结束")
    return transition(session, task_id, "cancelled", "已取消")
