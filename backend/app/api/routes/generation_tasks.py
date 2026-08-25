from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_session
from app.schemas.generation import (
    DesktopTaskStateUpdate, GenerationBatchResult,
    GenerationTaskCreate, GenerationTaskResponse,
)
from app.services import generation_tasks, image_batches
from app.services.image_storage import ImageStorageError, MAX_IMAGE_BYTES
from app.services.resources import ResourceNotFoundError


router = APIRouter(prefix="/generation-tasks", tags=["generation"])


def translate_error(error: Exception) -> HTTPException:
    if isinstance(error, ResourceNotFoundError):
        return HTTPException(status_code=404, detail=str(error))
    if isinstance(error, generation_tasks.InvalidTaskTransition):
        return HTTPException(status_code=409, detail=str(error))
    if isinstance(error, ImageStorageError):
        return HTTPException(status_code=error.status_code, detail=str(error))
    if isinstance(error, ValueError):
        return HTTPException(status_code=400, detail=str(error))
    return HTTPException(status_code=500, detail="生成任务操作失败")


@router.post("", response_model=GenerationTaskResponse, status_code=status.HTTP_201_CREATED)
def create_generation_task(payload: GenerationTaskCreate, session: Session = Depends(get_session)):
    try:
        return generation_tasks.create_task(session, payload.project_id, payload.prompt, payload.parent_image_id)
    except (ResourceNotFoundError, ValueError) as error:
        raise translate_error(error) from error


@router.get("/{task_id}", response_model=GenerationTaskResponse)
def get_generation_task(task_id: str, session: Session = Depends(get_session)):
    try:
        return generation_tasks.get_task(session, task_id)
    except ResourceNotFoundError as error:
        raise translate_error(error) from error


@router.post("/{task_id}/cancel", response_model=GenerationTaskResponse)
def cancel_generation_task(task_id: str, session: Session = Depends(get_session)):
    try:
        return generation_tasks.cancel_task(session, task_id)
    except (ResourceNotFoundError, generation_tasks.InvalidTaskTransition) as error:
        raise translate_error(error) from error


@router.patch("/{task_id}/desktop-state", response_model=GenerationTaskResponse)
def update_desktop_task_state(
    task_id: str,
    payload: DesktopTaskStateUpdate,
    session: Session = Depends(get_session),
):
    try:
        return generation_tasks.update_desktop_state(
            session, task_id, payload.state, payload.message, payload.last_page_url
        )
    except (ResourceNotFoundError, generation_tasks.InvalidTaskTransition) as error:
        raise translate_error(error) from error


@router.post("/{task_id}/complete-batch", response_model=GenerationBatchResult)
async def complete_generation_batch(
    request: Request,
    task_id: str,
    batch_id: str = Form(...),
    source_url: str = Form(...),
    files: list[UploadFile] = File(...),
    session: Session = Depends(get_session),
):
    batch_files: list[image_batches.BatchFile] = []
    for upload in files:
        content = await upload.read(MAX_IMAGE_BYTES + 1)
        batch_files.append(image_batches.BatchFile(
            file_name=upload.filename or "chatgpt-image",
            content=content,
        ))
    try:
        result = image_batches.complete_task(
            session,
            request.app.state.settings.data_dir,
            task_id,
            batch_id,
            source_url,
            batch_files,
        )
        return result.__dict__
    except (
        ResourceNotFoundError,
        generation_tasks.InvalidTaskTransition,
        ImageStorageError,
        ValueError,
    ) as error:
        raise translate_error(error) from error
