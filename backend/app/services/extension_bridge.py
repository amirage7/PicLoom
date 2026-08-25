import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.bridge import ExtensionConnection, PairingCode


CONNECTION_ID = "chatgpt-web"
ONLINE_WINDOW = timedelta(seconds=30)


class ExtensionAuthenticationError(Exception):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _digest(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def issue_pairing_code(session: Session) -> str:
    for _ in range(10):
        code = f"{secrets.randbelow(1_000_000):06d}"
        if session.scalar(select(PairingCode).where(PairingCode.code_hash == _digest(code))) is None:
            session.add(PairingCode(id=str(uuid4()), code_hash=_digest(code), expires_at=_now() + timedelta(minutes=5)))
            session.commit()
            return code
    raise RuntimeError("无法生成配对码")


def exchange_pairing_code(session: Session, code: str, extension_version: str) -> str:
    pairing = session.scalar(select(PairingCode).where(PairingCode.code_hash == _digest(code)))
    if pairing is None or pairing.used_at is not None or _aware(pairing.expires_at) < _now():
        raise ExtensionAuthenticationError("配对码无效或已过期")
    token = secrets.token_urlsafe(32)
    pairing.used_at = _now()
    connection = session.get(ExtensionConnection, CONNECTION_ID)
    if connection is None:
        connection = ExtensionConnection(id=CONNECTION_ID, token_hash=_digest(token), extension_version=extension_version, state="paired")
        session.add(connection)
    else:
        connection.token_hash = _digest(token)
        connection.extension_version = extension_version
        connection.state = "paired"
        connection.chat_url = None
        connection.last_seen = None
    session.commit()
    return token


def authenticate(session: Session, token: str) -> ExtensionConnection:
    connection = session.get(ExtensionConnection, CONNECTION_ID)
    if connection is None or not hmac.compare_digest(connection.token_hash, _digest(token)):
        raise ExtensionAuthenticationError("扩展令牌无效")
    return connection


def record_heartbeat(session: Session, connection: ExtensionConnection, state: str, chat_url: str | None) -> None:
    connection.state = state
    connection.chat_url = chat_url
    connection.last_seen = _now()
    session.commit()


def provider_status(session: Session) -> dict:
    connection = session.get(ExtensionConnection, CONNECTION_ID)
    if connection is None:
        return {"paired": False, "online": False, "state": "unpaired", "chat_url": None, "extension_version": None}
    online = connection.last_seen is not None and _aware(connection.last_seen) >= _now() - ONLINE_WINDOW
    return {
        "paired": True, "online": online, "state": connection.state,
        "chat_url": connection.chat_url, "extension_version": connection.extension_version,
    }
