from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_session
from app.schemas.generation import GenerationTaskCreate, GenerationTaskResponse
from app.services import generation_tasks
from app.services.resources import ResourceNotFoundError


router = APIRouter(prefix="/generation-tasks", tags=["generation"])


def translate_error(error: Exception) -> HTTPException:
    if isinstance(error, ResourceNotFoundError):
        return HTTPException(status_code=404, detail=str(error))
    if isinstance(error, generation_tasks.InvalidTaskTransition):
        return HTTPException(status_code=409, detail=str(error))
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
