from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from src.database.connection import Base

class VaultConfig(Base):
    __tablename__ = "vault_config"
    id = Column(Integer, primary_key=True, default=1)
    password_hash = Column(Text, nullable=False)
    password_salt = Column(Text, nullable=False)
    argon2_time_cost = Column(Integer, default=3)
    argon2_memory_cost = Column(Integer, default=65536)
    argon2_parallelism = Column(Integer, default=4)
    background_texture = Column(Text, default="noise")
    inactivity_timeout = Column(Integer, default=300)
    max_attempts = Column(Integer, default=5)
    lock_duration = Column(Integer, default=300)
    clipboard_clear_time = Column(Integer, default=30)
    password_visible_duration = Column(Integer, default=5)
    created_at = Column(DateTime, server_default=func.now())

class Category(Base):
    __tablename__ = "categories"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False, unique=True)
    color = Column(String, nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())

class Entry(Base):
    __tablename__ = "entries"
    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    category_id = Column(String, ForeignKey("categories.id"))
    icon_color = Column(String)
    username = Column(String)
    password = Column(String, nullable=False)
    url = Column(String)
    totp_secret = Column(String)
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    support_contact = Column(String)
    account_status = Column(String, default="active")
