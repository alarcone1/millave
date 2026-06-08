import os

DB_PATH = os.getenv("MILLAVE_DB_PATH", "./data/vault.db")
HOST = os.getenv("MILLAVE_HOST", "0.0.0.0")
PORT = int(os.getenv("MILLAVE_PORT", "8090"))
ENV = os.getenv("MILLAVE_ENV", "production")
