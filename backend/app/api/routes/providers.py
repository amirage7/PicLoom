from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_session
from app.schemas.bridge import PairingCodeResponse, ProviderStatusResponse
from app.services import extension_bridge


router = APIRouter(prefix="/providers/chatgpt", tags=["providers"])


@router.post("/pairing", response_model=PairingCodeResponse, status_code=status.HTTP_201_CREATED)
def create_pairing_code(session: Session = Depends(get_session)):
    return {"code": extension_bridge.issue_pairing_code(session), "expires_in_seconds": 300}


@router.get("/status", response_model=ProviderStatusResponse)
def get_provider_status(session: Session = Depends(get_session)):
    return extension_bridge.provider_status(session)
