from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool
from pysqlcipher3 import dbapi2 as pysqlcipher
from src.config import DB_PATH
import os

Base = declarative_base()


class _CipherConn:
    """Wrapper que adapta pysqlcipher3 Connection al protocolo de SQLAlchemy."""

    def __init__(self, conn):
        object.__setattr__(self, '_conn', conn)

    def create_function(self, name, num_params, *args, **kwargs):
        func = args[-1] if args else None
        if func is not None and len(args) >= 2:
            self._conn.create_function(name, num_params, func)
        elif func is not None:
            self._conn.create_function(name, num_params, func)
        else:
            self._conn.create_function(name, num_params, args[0] if args else None)

    def __getattr__(self, name):
        return getattr(self._conn, name)


def get_engine(password=None):
    db_dir = os.path.dirname(DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

    if password:
        def _connect():
            conn = pysqlcipher.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute(f"PRAGMA key=\"x'{password}'\"")
            cursor.execute("PRAGMA cipher_compatibility = 4")
            cursor.execute("PRAGMA cipher_page_size = 4096")
            cursor.execute("PRAGMA kdf_iter = 256000")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()
            return _CipherConn(conn)

        engine = create_engine("sqlite:///", creator=_connect, poolclass=NullPool)
        return engine
    else:
        def _connect_plain():
            return _CipherConn(pysqlcipher.connect(DB_PATH))

        engine = create_engine("sqlite:///", creator=_connect_plain, poolclass=NullPool)
        return engine


engine = get_engine()
SessionLocal = sessionmaker(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
