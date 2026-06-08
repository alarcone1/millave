from pydantic import BaseModel

class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "0.1.0"
    vault_exists: bool
    uptime: int

class VaultStatus(BaseModel):
    vault_exists: bool

class LoginRequest(BaseModel):
    password: str

class LoginResponse(BaseModel):
    authenticated: bool
    token: str | None = None
    locked: bool = False
    lock_duration: int = 0
    attemptsRemaining: int = 5

class VaultCreateRequest(BaseModel):
    password: str

class VaultCreateResponse(BaseModel):
    status: str
    recovery_phrase: list[str]

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class ChangePasswordResponse(BaseModel):
    status: str
    recovery_phrase: list[str]
