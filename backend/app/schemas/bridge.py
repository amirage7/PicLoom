from pydantic import BaseModel, Field


class PairingCodeResponse(BaseModel):
    code: str
    expires_in_seconds: int


class ExtensionPairRequest(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")
    extension_version: str = Field(min_length=1, max_length=32)


class ExtensionPairResponse(BaseModel):
    token: str


class ExtensionHeartbeat(BaseModel):
    state: str = Field(min_length=1, max_length=32)
    chat_url: str | None = Field(default=None, max_length=1024)


class ProviderStatusResponse(BaseModel):
    paired: bool
    online: bool
    state: str
    chat_url: str | None
    extension_version: str | None
