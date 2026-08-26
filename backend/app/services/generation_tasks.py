from datetime import datetime, timezone
import json
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Image, Project
from app.services.image_names import allocate_image_name, preferred_image_name
from app.services.image_storage import store_image
from app.models.generation import GenerationTask
from app.services.resources import ResourceNotFoundError
from app.services import image_relations


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
DESKTOP_TRANSITIONS = {
    "queued": {"opening_chatgpt", "cancelled"},
    "opening_chatgpt": {"login_required", "ready", "page_changed", "failed", "cancelled"},
    "login_required": {"ready", "collecting", "failed", "cancelled"},
    "ready": {"sending", "collecting", "failed", "cancelled"},
    "sending": {"generating", "refused", "rate_limited", "page_changed", "failed", "cancelled"},
    "generating": {"collecting", "refused", "rate_limited", "page_changed", "failed", "cancelled"},
    "collecting": {"importing", "refused", "rate_limited", "page_changed", "failed", "cancelled"},
    "importing": {"completed", "failed", "cancelled"},
    "page_changed": {"ready", "collecting", "failed", "cancelled"},
    "rate_limited": {"ready", "collecting", "failed", "cancelled"},
    "refused": set(),
    "completed": set(),
    "failed": {"ready", "collecting", "cancelled"},
    "cancelled": set(),
}



class InvalidTaskTransition(Exception):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_task(
    session: Session,
    project_id: str | None,
    prompt: str,
    parent_image_id: str | None,
    reference_image_ids: list[str] | None = None,
) -> GenerationTask:
    normalized_prompt = prompt.strip()
    if not normalized_prompt:
        raise ValueError("Prompt 不能为空")
    if project_id is not None and session.get(Project, project_id) is None:
        raise ResourceNotFoundError("项目不存在")
    requested = reference_image_ids or ([parent_image_id] if parent_image_id else [])
    normalized_references = list(dict.fromkeys(requested))
    for reference_id in normalized_references:
        reference = session.get(Image, reference_id)
        if reference is None or reference.project_id != project_id:
            raise ValueError("参考图片必须属于当前项目")
    legacy_parent_id = normalized_references[0] if normalized_references else None
    now = _now()
    task = GenerationTask(
        id=str(uuid4()), project_id=project_id, provider="chatgpt-web",
        prompt=normalized_prompt, parent_image_id=legacy_parent_id,
        reference_image_ids_json=json.dumps(normalized_references),
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


def update_desktop_state(
    session: Session,
    task_id: str,
    state: str,
    message: str,
    last_page_url: str | None = None,
) -> GenerationTask:
    task = get_task(session, task_id)
    if state != task.status and state not in DESKTOP_TRANSITIONS.get(task.status, set()):
        raise InvalidTaskTransition(f"无法从 {task.status} 切换到 {state}")
    task.provider_mode = "desktop"
    task.status = state
    task.progress_message = message[:255]
    if last_page_url is not None:
        task.last_page_url = last_page_url[:2048]
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
    if task.provider_mode == "desktop":
        return update_desktop_state(session, task_id, "cancelled", "已取消")

    return transition(session, task_id, "cancelled", "已取消")

def complete_with_image(
    session: Session,
    data_dir: Path,
    task_id: str,
    content: bytes,
    chat_url: str,
) -> GenerationTask:
    task = get_task(session, task_id)
    if task.status != "downloading":
        raise InvalidTaskTransition("任务尚未进入图片下载阶段")
    stored = store_image(data_dir / "images", task.project_id, content)
    file_name = f"chatgpt-{task.id}{stored.suffix}"
    name, name_key = allocate_image_name(
        session, task.project_id, preferred_image_name(task.prompt, file_name)
    )
    image = Image(
        id=str(uuid4()),
        project_id=task.project_id,
        image_path=stored.relative_to(data_dir).as_posix(),
        file_name=file_name,
        name=name,
        name_key=name_key,
        prompt=task.prompt,
        tags_json=[],
        parent_id=task.parent_image_id,
        position_x=0,
        position_y=0,
        is_on_canvas=task.project_id is not None,
        is_favorite=False,
        source_type="generated",
        created_time=_now(),
    )
    try:
        session.add(image)
        session.flush()
        for reference_id in task.reference_image_ids:
            if reference_id != image.id:
                image_relations.create_relation(
                    session, reference_id, image.id, commit=False
                )
        task.status = "completed"
        task.progress_message = "图片已保存"
        task.chat_url = chat_url[:1024]
        task.image_id = image.id
        task.updated_time = _now()
        session.commit()
        session.refresh(task)
    except Exception:
        session.rollback()
        stored.unlink(missing_ok=True)
        raise
    return task
