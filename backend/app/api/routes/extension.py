from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_session
from app.models.bridge import ExtensionConnection
from app.schemas.bridge import ExtensionHeartbeat, ExtensionPairRequest, ExtensionPairResponse
from app.services import extension_bridge


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
