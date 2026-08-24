from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_session
from app.models.bridge import ExtensionConnection
from app.schemas.bridge import ExtensionHeartbeat, ExtensionPairRequest, ExtensionPairResponse
from app.schemas.extension_tasks import ExtensionTaskUpdate
from app.schemas.generation import GenerationTaskResponse
from app.services import extension_bridge, generation_tasks
from app.services.resources import ResourceNotFoundError


router = APIRouter(prefix="/extension", tags=["extension"])


def require_extension(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
) -> ExtensionConnection:
    if authorization is None or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="扩展未认证")
    try:
        return extension_bridge.authenticate(session, authorization.removeprefix("Bearer "))
    except extension_bridge.ExtensionAuthenticationError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error


@router.post("/pair", response_model=ExtensionPairResponse)
def pair_extension(payload: ExtensionPairRequest, session: Session = Depends(get_session)):
    try:
        token = extension_bridge.exchange_pairing_code(session, payload.code, payload.extension_version)
    except extension_bridge.ExtensionAuthenticationError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error
    return {"token": token}


@router.post("/heartbeat", status_code=status.HTTP_204_NO_CONTENT)
def heartbeat(
    payload: ExtensionHeartbeat,
    connection: ExtensionConnection = Depends(require_extension),
    session: Session = Depends(get_session),
) -> Response:
    extension_bridge.record_heartbeat(session, connection, payload.state, payload.chat_url)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.get("/tasks/next", response_model=GenerationTaskResponse | None)
def next_task(
    _connection: ExtensionConnection = Depends(require_extension),
    session: Session = Depends(get_session),
):
    return generation_tasks.claim_next_task(session)


@router.patch("/tasks/{task_id}", response_model=GenerationTaskResponse)
def update_task(
    task_id: str,
    payload: ExtensionTaskUpdate,
    _connection: ExtensionConnection = Depends(require_extension),
    session: Session = Depends(get_session),
):
    try:
        return generation_tasks.transition(
            session, task_id, payload.status, payload.progress_message,
            payload.error_code, payload.chat_url,
        )
    except ResourceNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except generation_tasks.InvalidTaskTransition as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
