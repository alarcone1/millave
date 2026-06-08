from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy import create_engine, text
from src.database.connection import get_db, get_engine
from src.database.models import VaultConfig, Category, Base
from src.modules.auth.schemas import (
    HealthResponse, VaultStatus, LoginRequest, LoginResponse,
    VaultCreateRequest, VaultCreateResponse,
    ChangePasswordRequest, ChangePasswordResponse
)
from src.modules.auth.service import hash_password, verify_password
from src.config import DB_PATH
import time
import secrets
import os
import json
import hashlib

router = APIRouter()
start_time = time.time()
_active_sessions = {}

login_attempts = {}
_current_encryption_key = None


@router.get("/health", response_model=HealthResponse)
def health():
    """Verifica el estado del servidor y si existe un vault."""
    vault_exists = os.path.isfile(DB_PATH)
    return HealthResponse(
        vault_exists=vault_exists,
        uptime=int(time.time() - start_time)
    )


@router.get("/vault/status", response_model=VaultStatus)
def vault_status():
    """Verifica si existe un vault cifrado en el servidor."""
    vault_exists = os.path.isfile(DB_PATH)
    return VaultStatus(vault_exists=vault_exists)


@router.post("/vault/create", response_model=VaultCreateResponse)
def create_vault(request: VaultCreateRequest):
    """Crea un nuevo vault cifrado con la contraseña maestra proporcionada. Genera una frase de recuperación BIP-39 de 24 palabras."""
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="la clave debe tener al menos 6 caracteres")

    if os.path.isfile(DB_PATH):
        raise HTTPException(status_code=400, detail="el vault ya existe")

    hashed_password, salt = hash_password(request.password)

    password_bytes = request.password.encode('utf-8')
    salt_bytes = bytes.fromhex(salt)
    encryption_key = hashlib.pbkdf2_hmac(
        'sha256', password_bytes, salt_bytes, 100000, dklen=32
    ).hex()

    from pysqlcipher3 import dbapi2 as sqlite
    conn = sqlite.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(f"PRAGMA key=\"x'{encryption_key}'\"")
    cursor.execute("PRAGMA cipher_compatibility = 4")
    cursor.execute("PRAGMA cipher_page_size = 4096")
    cursor.execute("PRAGMA kdf_iter = 256000")
    cursor.execute("PRAGMA journal_mode=WAL")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS vault_config (
            id INTEGER PRIMARY KEY DEFAULT 1,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            argon2_time_cost INTEGER DEFAULT 3,
            argon2_memory_cost INTEGER DEFAULT 65536,
            argon2_parallelism INTEGER DEFAULT 4,
            background_texture TEXT DEFAULT 'noise',
            inactivity_timeout INTEGER DEFAULT 300,
            max_attempts INTEGER DEFAULT 5,
            lock_duration INTEGER DEFAULT 300,
            clipboard_clear_time INTEGER DEFAULT 30,
            password_visible_duration INTEGER DEFAULT 5,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS entries (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            category_id TEXT,
            icon_color TEXT,
            username TEXT,
            password TEXT NOT NULL,
            url TEXT,
            totp_secret TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            support_contact TEXT,
            account_status TEXT DEFAULT 'active',
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )
    """)

    cursor.execute(
        "INSERT INTO vault_config (password_hash, password_salt, argon2_time_cost, argon2_memory_cost, argon2_parallelism) VALUES (?, ?, ?, ?, ?)",
        (hashed_password, salt, 3, 65536, 4)
    )
    cursor.execute(
        "INSERT INTO categories (id, name, color, sort_order) VALUES (?, ?, ?, ?)",
        ("general", "general", "#78716c", 0)
    )
    conn.commit()
    conn.close()

    # Almacenar salt en archivo separado (el salt no es secreto)
    salt_path = DB_PATH + ".salt"
    with open(salt_path, "w") as f:
        f.write(salt)

    wordlist_path = os.path.join(os.path.dirname(__file__), "../../utils/wordlist.json")
    with open(wordlist_path, "r") as f:
        wordlist = json.load(f)

    entropy_bits = secrets.randbits(256)
    phrase_words = []
    for i in range(24):
        word_index = (entropy_bits >> (i * 11)) & 0x7FF
        if word_index < len(wordlist):
            phrase_words.append(wordlist[word_index])
        else:
            phrase_words.append(wordlist[word_index % len(wordlist)])

    return VaultCreateResponse(
        status="created",
        recovery_phrase=phrase_words
    )


@router.post("/auth/login", response_model=LoginResponse)
def login(request: LoginRequest):
    """Autentica al usuario verificando la contraseña maestra con Argon2id. Gestiona intentos fallidos y bloqueo temporal."""
    if not os.path.isfile(DB_PATH):
        raise HTTPException(status_code=404, detail="vault no existe")

    session_id = "default"
    attempt_data = login_attempts.get(session_id, {})
    if attempt_data.get("locked_at"):
        lock_duration = int(attempt_data.get("lock_duration", 300))
        elapsed = time.time() - attempt_data["locked_at"]
        if elapsed < lock_duration:
            remaining = int(lock_duration - elapsed)
            return LoginResponse(
                authenticated=False,
                locked=True,
                lock_duration=remaining,
                attemptsRemaining=0
            )
        else:
            login_attempts.pop(session_id, None)
            attempt_data = {}

    max_attempts = 5
    lock_duration_cfg = 300
    try:
        temp_salt = _get_stored_salt()
        if temp_salt:
            pw_bytes = request.password.encode('utf-8')
            salt_bytes = bytes.fromhex(temp_salt)
            enc_key = hashlib.pbkdf2_hmac('sha256', pw_bytes, salt_bytes, 100000, dklen=32).hex()
            engine = get_engine(enc_key)
            SessionLocal = sessionmaker(bind=engine)
            db = SessionLocal()
            try:
                vault_cfg = db.query(VaultConfig).first()
                if vault_cfg:
                    max_attempts = vault_cfg.max_attempts or 5
                    lock_duration_cfg = vault_cfg.lock_duration or 300
            finally:
                db.close()
    except Exception:
        pass

    temp_salt = _get_stored_salt()
    if temp_salt is None:
        raise HTTPException(status_code=500, detail="error leyendo vault")

    password_bytes = request.password.encode('utf-8')
    salt_bytes = bytes.fromhex(temp_salt)
    encryption_key = hashlib.pbkdf2_hmac(
        'sha256', password_bytes, salt_bytes, 100000, dklen=32
    ).hex()

    try:
        engine = get_engine(encryption_key)
        SessionLocal = sessionmaker(bind=engine)
        db = SessionLocal()
        vault = db.query(VaultConfig).first()
    except Exception:
        _record_failed_attempt(session_id, max_attempts, lock_duration_cfg)
        attempts_remaining = max_attempts - login_attempts.get(session_id, {}).get("count", 0)
        if attempts_remaining <= 0:
            login_attempts[session_id]["locked_at"] = time.time()
            login_attempts[session_id]["lock_duration"] = lock_duration_cfg
            return LoginResponse(authenticated=False, locked=True, lock_duration=lock_duration_cfg, attemptsRemaining=0)
        return LoginResponse(authenticated=False, attemptsRemaining=max(attempts_remaining, 0))
    finally:
        try:
            db.close()
        except Exception:
            pass

    if not vault:
        _record_failed_attempt(session_id, max_attempts, lock_duration_cfg)
        attempts_remaining = max_attempts - login_attempts.get(session_id, {}).get("count", 0)
        if attempts_remaining <= 0:
            login_attempts[session_id]["locked_at"] = time.time()
            login_attempts[session_id]["lock_duration"] = lock_duration_cfg
            return LoginResponse(authenticated=False, locked=True, lock_duration=lock_duration_cfg, attemptsRemaining=0)
        return LoginResponse(authenticated=False, attemptsRemaining=max(attempts_remaining, 0))

    if verify_password(request.password, vault.password_hash, vault.password_salt):
        login_attempts.pop(session_id, None)
        token = secrets.token_hex(32)
        _active_sessions[token] = {"authenticated": True, "encryption_key": encryption_key}
        global _current_encryption_key
        _current_encryption_key = encryption_key
        return LoginResponse(authenticated=True, token=token)
    else:
        _record_failed_attempt(session_id, max_attempts, lock_duration_cfg)
        attempts_remaining = max_attempts - login_attempts.get(session_id, {}).get("count", 0)
        if attempts_remaining <= 0:
            login_attempts[session_id]["locked_at"] = time.time()
            login_attempts[session_id]["lock_duration"] = lock_duration_cfg
            return LoginResponse(authenticated=False, locked=True, lock_duration=lock_duration_cfg, attemptsRemaining=0)
        return LoginResponse(authenticated=False, attemptsRemaining=max(attempts_remaining, 0))


def _record_failed_attempt(session_id: str, max_attempts: int, lock_duration: int):
    current = login_attempts.get(session_id, {})
    count = current.get("count", 0) + 1
    login_attempts[session_id] = {
        "count": count,
        "max_attempts": max_attempts,
        "lock_duration": lock_duration
    }


def _get_stored_salt() -> str | None:
    """Lee el salt del archivo separado."""
    salt_path = DB_PATH + ".salt"
    try:
        with open(salt_path, "r") as f:
            return f.read().strip()
    except Exception:
        return None


@router.post("/auth/verify")
def verify_session(data: dict):
    """Verifica si un token de sesión es válido."""
    token = data.get("token")
    if token and token in _active_sessions:
        return {"authenticated": True}
    return {"authenticated": False}


@router.post("/auth/change-password", response_model=ChangePasswordResponse)
def change_password(request: ChangePasswordRequest):
    """Cambia la contraseña maestra. Verifica la actual, re-cifra el vault y genera nueva frase de recuperación."""
    if len(request.new_password) < 6:
        raise HTTPException(status_code=400, detail="la nueva contraseña debe tener al menos 6 caracteres")

    from src.services.crypto import verify_master_password, rekey_database

    if not verify_master_password(request.current_password):
        raise HTTPException(status_code=401, detail="la contraseña actual es incorrecta")

    try:
        rekey_database(request.current_password, request.new_password)
    except Exception as e:
        raise HTTPException(status_code=500, detail="error al re-cifrar el vault")

    wordlist_path = os.path.join(os.path.dirname(__file__), "../../utils/wordlist.json")
    with open(wordlist_path, "r") as f:
        wordlist = json.load(f)

    entropy_bits = secrets.randbits(256)
    phrase_words = []
    for i in range(24):
        word_index = (entropy_bits >> (i * 11)) & 0x7FF
        phrase_words.append(wordlist[word_index % len(wordlist)])

    _active_sessions.clear()

    return ChangePasswordResponse(
        status="changed",
        recovery_phrase=phrase_words
    )


@router.get("/auth/config")
def get_security_config():
    """Obtiene la configuración de seguridad actual (inactividad, intentos, bloqueo, portapapeles, visibilidad de contraseña)."""
    defaults = {
        "inactivity_timeout": 300,
        "max_attempts": 5,
        "lock_duration": 300,
        "clipboard_clear_time": 30,
        "password_visible_duration": 5
    }

    if not _current_encryption_key:
        return defaults

    try:
        engine = get_engine(_current_encryption_key)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT inactivity_timeout, max_attempts, lock_duration, clipboard_clear_time, password_visible_duration FROM vault_config WHERE id = 1"))
            row = result.fetchone()
            if row:
                return {
                    "inactivity_timeout": row[0] or defaults["inactivity_timeout"],
                    "max_attempts": row[1] or defaults["max_attempts"],
                    "lock_duration": row[2] or defaults["lock_duration"],
                    "clipboard_clear_time": row[3] or defaults["clipboard_clear_time"],
                    "password_visible_duration": row[4] or defaults["password_visible_duration"]
                }
    except Exception:
        pass

    return defaults


@router.patch("/auth/config")
def update_security_config(data: dict):
    """Actualiza la configuración de seguridad del vault."""
    allowed_keys = ["inactivity_timeout", "max_attempts", "lock_duration", "clipboard_clear_time", "password_visible_duration"]

    if not _current_encryption_key:
        raise HTTPException(status_code=401, detail="no autenticado")

    try:
        engine = get_engine(_current_encryption_key)
        with engine.connect() as conn:
            updates = []
            params = {}
            for key in allowed_keys:
                if key in data:
                    updates.append(f"{key} = :{key}")
                    params[key] = int(data[key])
            if updates:
                conn.execute(text(f"UPDATE vault_config SET {', '.join(updates)} WHERE id = 1"), params)
                conn.commit()
    except Exception:
        raise HTTPException(status_code=500, detail="error al actualizar configuración")

    return {"status": "updated"}


@router.get("/auth/lock-status")
def get_lock_status():
    """Obtiene el estado de bloqueo por intentos fallidos y el tiempo restante."""
    session_id = "default"
    attempt_data = login_attempts.get(session_id, {})

    if not attempt_data.get("locked_at"):
        return {"locked": False, "remaining_seconds": 0}

    lock_duration = int(attempt_data.get("lock_duration", 300))
    locked_at = attempt_data.get("locked_at", 0)
    elapsed = time.time() - locked_at

    if elapsed >= lock_duration:
        login_attempts.pop(session_id, None)
        return {"locked": False, "remaining_seconds": 0}

    remaining = int(lock_duration - elapsed)
    return {"locked": True, "remaining_seconds": remaining}


@router.post("/auth/logout")
def logout():
    """Cierra la sesión actual y limpia los intentos de login."""
    session_id = "default"
    login_attempts.pop(session_id, None)
    return {"status": "logged_out"}
