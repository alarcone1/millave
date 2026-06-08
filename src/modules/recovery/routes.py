from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from src.config import DB_PATH
from src.services.crypto import get_stored_salt, derive_encryption_key, hash_password_with_salt, rekey_database
from src.modules.auth.service import hash_password
from pysqlcipher3 import dbapi2 as sqlite
import os
import json
import secrets

router = APIRouter()


class VerifyPhraseRequest(BaseModel):
    phrase: list[str]


class VerifyPhraseResponse(BaseModel):
    valid: bool


class DeriveKeyRequest(BaseModel):
    phrase: list[str]


class DeriveKeyResponse(BaseModel):
    recovery_key: str


class ResetPasswordRequest(BaseModel):
    recovery_key: str
    new_password: str


class ResetPasswordResponse(BaseModel):
    status: str
    recovery_phrase: list[str]


RECOVERY_SALT = b"millave-recovery"


def derive_recovery_key(phrase_words: list[str]) -> str:
    if len(phrase_words) != 24:
        raise HTTPException(status_code=400, detail="la frase debe tener 24 palabras")

    wordlist_path = os.path.join(os.path.dirname(__file__), "../../utils/wordlist.json")
    with open(wordlist_path, "r") as f:
        wordlist = json.load(f)

    word_to_index = {word.lower(): i for i, word in enumerate(wordlist)}

    entropy_bits = 0
    for i, word in enumerate(phrase_words):
        w = word.lower().strip()
        if w not in word_to_index:
            raise HTTPException(status_code=400, detail=f"palabra no válida: {w}")
        idx = word_to_index[w]
        entropy_bits |= idx << (i * 11)

    entropy_bytes = entropy_bits.to_bytes(33, byteorder="big")[:32]

    import hashlib
    key_bytes = hashlib.pbkdf2_hmac("sha256", entropy_bytes, RECOVERY_SALT, 2048, dklen=32)
    return key_bytes.hex()


@router.get("/wordlist")
def get_wordlist():
    """Retorna la lista de 2048 palabras BIP-39 para autocompletado de frases de recuperación."""
    wordlist_path = os.path.join(os.path.dirname(__file__), "../../utils/wordlist.json")
    with open(wordlist_path, "r") as f:
        words = json.load(f)
    return {"words": words}


@router.post("/verify", response_model=VerifyPhraseResponse)
def verify_phrase(request: VerifyPhraseRequest):
    """Verifica si una frase de recuperación de 24 palabras puede abrir el vault."""
    if not os.path.isfile(DB_PATH):
        raise HTTPException(status_code=404, detail="vault no existe")

    try:
        recovery_key = derive_recovery_key(request.phrase)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="error procesando la frase")

    try:
        conn = sqlite.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(f"PRAGMA key=\"x'{recovery_key}'\"")
        cursor.execute("PRAGMA cipher_compatibility = 4")
        cursor.execute("PRAGMA cipher_page_size = 4096")
        cursor.execute("PRAGMA kdf_iter = 256000")
        cursor.execute("SELECT id FROM vault_config LIMIT 1")
        cursor.fetchone()
        conn.close()
        return VerifyPhraseResponse(valid=True)
    except Exception:
        try:
            conn.close()
        except Exception:
            pass
        return VerifyPhraseResponse(valid=False)


@router.post("/derive-key", response_model=DeriveKeyResponse)
def derive_key(request: DeriveKeyRequest):
    """Deriva una clave de recuperación a partir de una frase BIP-39 de 24 palabras."""
    try:
        recovery_key = derive_recovery_key(request.phrase)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="error procesando la frase")

    return DeriveKeyResponse(recovery_key=recovery_key)


@router.post("/reset", response_model=ResetPasswordResponse)
def reset_password(request: ResetPasswordRequest):
    """Restablece la contraseña maestra usando la frase de recuperación. Re-cifra el vault y genera una nueva frase."""
    if not os.path.isfile(DB_PATH):
        raise HTTPException(status_code=404, detail="vault no existe")

    if len(request.new_password) < 6:
        raise HTTPException(status_code=400, detail="la clave debe tener al menos 6 caracteres")

    recovery_key = request.recovery_key

    salt = get_stored_salt()
    new_encryption_key = derive_encryption_key(request.new_password, salt)

    conn = sqlite.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        cursor.execute(f"PRAGMA key=\"x'{recovery_key}'\"")
        cursor.execute("PRAGMA cipher_compatibility = 4")
        cursor.execute("PRAGMA cipher_page_size = 4096")
        cursor.execute("PRAGMA kdf_iter = 256000")
        cursor.execute("SELECT id FROM vault_config LIMIT 1")
        cursor.fetchone()

        existing_salt_row = cursor.execute("SELECT password_salt FROM vault_config LIMIT 1").fetchone()
        existing_salt = existing_salt_row[0]
        new_hash = hash_password_with_salt(request.new_password, existing_salt)
        cursor.execute("UPDATE vault_config SET password_hash = ?", (new_hash,))
        conn.commit()

        cursor.execute(f"PRAGMA rekey = \"x'{new_encryption_key}'\"")
        conn.commit()
        conn.close()
    except Exception:
        try:
            conn.close()
        except Exception:
            pass
        raise HTTPException(status_code=400, detail="no se pudo acceder al vault")

    wordlist_path = os.path.join(os.path.dirname(__file__), "../../utils/wordlist.json")
    with open(wordlist_path, "r") as f:
        wordlist = json.load(f)

    entropy_bits = secrets.randbits(256)
    phrase_words = []
    for i in range(24):
        word_index = (entropy_bits >> (i * 11)) & 0x7FF
        phrase_words.append(wordlist[word_index % len(wordlist)])

    return ResetPasswordResponse(
        status="reset",
        recovery_phrase=phrase_words
    )
