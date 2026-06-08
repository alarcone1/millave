from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
import secrets
import hashlib

ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    salt_len=16
)


def hash_password(password: str) -> tuple[str, str]:
    salt = secrets.token_hex(16)
    password_bytes = password.encode('utf-8')
    salt_bytes = bytes.fromhex(salt)
    hash_input = password_bytes + salt_bytes
    digest = hashlib.sha256(hash_input).hexdigest()
    hashed = ph.hash(digest)
    return hashed, salt


def verify_password(password: str, password_hash: str, salt: str) -> bool:
    password_bytes = password.encode('utf-8')
    salt_bytes = bytes.fromhex(salt)
    hash_input = password_bytes + salt_bytes
    digest = hashlib.sha256(hash_input).hexdigest()
    try:
        ph.verify(password_hash, digest)
        return True
    except VerifyMismatchError:
        return False
