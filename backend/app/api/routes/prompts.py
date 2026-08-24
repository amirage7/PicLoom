from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_session
from app.schemas.resources import PromptCreate, PromptResponse, PromptUpdate
from app.services import resources


router = APIRouter(prefix="/prompts", tags=["prompts"])


@router.get("", response_model=list[PromptResponse])
def get_prompts(session: Session = Depends(get_session)):
    return resources.list_prompts(session)


@router.post("", response_model=PromptResponse, status_code=status.HTTP_201_CREATED)
def post_prompt(payload: PromptCreate, session: Session = Depends(get_session)):
    return resources.create_prompt(session, payload)


@router.patch("/{prompt_id}", response_model=PromptResponse)
def patch_prompt(prompt_id: str, payload: PromptUpdate, session: Session = Depends(get_session)):
    try:
        return resources.update_prompt(session, prompt_id, payload)
    except resources.ResourceNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/{prompt_id}/duplicate", response_model=PromptResponse, status_code=status.HTTP_201_CREATED)
def copy_prompt(prompt_id: str, session: Session = Depends(get_session)):
    try:
        return resources.duplicate_prompt(session, prompt_id)
    except resources.ResourceNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.delete("/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_prompt(prompt_id: str, session: Session = Depends(get_session)) -> Response:
    try:
        resources.delete_prompt(session, prompt_id)
    except resources.ResourceNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)
