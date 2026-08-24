from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_session
from app.schemas.resources import ProjectCreate, ProjectResponse, ProjectUpdate
from app.services import resources


router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectResponse])
def get_projects(session: Session = Depends(get_session)):
    return resources.list_projects(session)


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def post_project(payload: ProjectCreate, session: Session = Depends(get_session)):
    return resources.create_project(session, payload)


@router.patch("/{project_id}", response_model=ProjectResponse)
def patch_project(project_id: str, payload: ProjectUpdate, session: Session = Depends(get_session)):
    try:
        return resources.update_project(session, project_id, payload)
    except resources.ResourceNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_project(project_id: str, session: Session = Depends(get_session)) -> Response:
    try:
        resources.delete_project(session, project_id)
    except resources.ResourceNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except resources.ResourceConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)
