from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from src.database.connection import get_engine

router = APIRouter()


@router.get("/config")
def get_config():
    """Obtiene la configuración de la aplicación (textura de fondo actual)."""
    try:
        from src.modules.auth.routes import _current_encryption_key
        if not _current_encryption_key:
            return {"background_texture": "noise"}
        engine = get_engine(_current_encryption_key)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT value FROM vault_config WHERE key = 'background_texture'"))
            row = result.fetchone()
            if row:
                return {"background_texture": row[0]}
            result2 = conn.execute(text("SELECT background_texture FROM vault_config WHERE id = 1"))
            row2 = result2.fetchone()
            if row2 and row2[0]:
                return {"background_texture": row2[0]}
    except Exception:
        pass
    return {"background_texture": "noise"}


@router.patch("/config")
def update_config(data: dict):
    """Actualiza la configuración de la aplicación (textura de fondo)."""
    valid_textures = ["none", "noise", "velvet", "stars", "geometric", "frost", "parchment", "water", "carbon"]
    texture = data.get("background_texture", "noise")
    if texture not in valid_textures:
        texture = "noise"

    try:
        from src.modules.auth.routes import _current_encryption_key
        if not _current_encryption_key:
            raise HTTPException(status_code=401, detail="no autenticado")

        engine = get_engine(_current_encryption_key)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT value FROM vault_config WHERE key = 'background_texture'"))
            if result.fetchone():
                conn.execute(text("UPDATE vault_config SET value = :val WHERE key = 'background_texture'"), {"val": texture})
            else:
                conn.execute(text("INSERT INTO vault_config (key, value) VALUES ('background_texture', :val)"), {"val": texture})

            conn.execute(text("UPDATE vault_config SET background_texture = :val WHERE id = 1"), {"val": texture})
            conn.commit()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="error al actualizar textura")

    return {"status": "updated"}
