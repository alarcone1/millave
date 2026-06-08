import hashlib
import os
from src.config import DB_PATH
from src.modules.auth.service import hash_password, verify_password, ph


def get_stored_salt() -> str:
    salt_path = DB_PATH + ".salt"
    with open(salt_path, "r") as f:
        return f.read().strip()


def derive_encryption_key(password: str, salt: str) -> str:
    password_bytes = password.encode("utf-8")
    salt_bytes = bytes.fromhex(salt)
    return hashlib.pbkdf2_hmac("sha256", password_bytes, salt_bytes, 100000, dklen=32).hex()


def verify_master_password(password: str) -> bool:
    from src.database.connection import get_engine
    from sqlalchemy.orm import sessionmaker
    from src.database.models import VaultConfig

    salt = get_stored_salt()
    encryption_key = derive_encryption_key(password, salt)
    engine = get_engine(encryption_key)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        vault = db.query(VaultConfig).first()
        if not vault:
            return False
        return verify_password(password, vault.password_hash, vault.password_salt)
    except Exception:
        return False
    finally:
        db.close()


def hash_password_with_salt(password: str, salt: str) -> str:
    password_bytes = password.encode("utf-8")
    salt_bytes = bytes.fromhex(salt)
    hash_input = password_bytes + salt_bytes
    digest = hashlib.sha256(hash_input).hexdigest()
    return ph.hash(digest)


def rekey_database(current_password: str, new_password: str) -> None:
    from src.database.connection import get_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy import text
    from src.database.models import VaultConfig

    salt = get_stored_salt()

    current_key = derive_encryption_key(current_password, salt)
    new_key = derive_encryption_key(new_password, salt)

    engine = get_engine(current_key)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        vault = db.query(VaultConfig).first()
        existing_salt = vault.password_salt
        new_hash = hash_password_with_salt(new_password, existing_salt)
        vault.password_hash = new_hash
        db.commit()
    finally:
        db.close()

    raw_engine = get_engine(current_key)
    with raw_engine.connect() as conn:
        conn.execute(text(f"PRAGMA rekey = \"x'{new_key}'\""))
        conn.commit()
    raw_engine.dispose()
