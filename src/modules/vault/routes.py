from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_
from src.database.connection import get_engine
from src.database.models import Entry, Category
from src.modules.vault.schemas import (
    EntryListItem, EntryDetail, SearchResponse
)
from src.modules.auth.routes import _active_sessions
import secrets

router = APIRouter()


class CreateEntryRequest(BaseModel):
    title: str
    password: str
    username: str | None = None
    url: str | None = None
    totp_secret: str | None = None
    notes: str | None = None
    category_id: str | None = None
    icon_color: str | None = None
    support_contact: str | None = None
    account_status: str = "active"


def _get_db():
    for session_data in _active_sessions.values():
        if isinstance(session_data, dict) and "encryption_key" in session_data:
            engine = get_engine(session_data["encryption_key"])
            return Session(bind=engine)
    return None


@router.get("/entries", response_model=list[EntryListItem])
def list_entries():
    """Lista todas las credenciales del vault ordenadas por título."""
    db = _get_db()
    if not db:
        return []
    try:
        entries = db.query(Entry).order_by(Entry.title.asc()).all()
        result = []
        for entry in entries:
            category = db.query(Category).filter(Category.id == entry.category_id).first() if entry.category_id else None
            result.append(EntryListItem(
                id=entry.id,
                title=entry.title,
                username=entry.username,
                url=entry.url,
                account_status=entry.account_status or "active",
                category_id=entry.category_id,
                category_name=category.name if category else None,
                category_color=category.color if category else None
            ))
        return result
    finally:
        db.close()


@router.get("/entries/{entry_id}", response_model=EntryDetail)
def get_entry(entry_id: str):
    """Obtiene el detalle completo de una credencial incluyendo la contraseña cifrada."""
    db = _get_db()
    if not db:
        raise HTTPException(status_code=401, detail="no autenticado")
    try:
        entry = db.query(Entry).filter(Entry.id == entry_id).first()
        if not entry:
            raise HTTPException(status_code=404, detail="llave no encontrada")
        category = db.query(Category).filter(Category.id == entry.category_id).first() if entry.category_id else None
        return EntryDetail(
            id=entry.id,
            title=entry.title,
            username=entry.username,
            password=entry.password,
            url=entry.url,
            totp_secret=entry.totp_secret,
            notes=entry.notes,
            category_id=entry.category_id,
            category_name=category.name if category else None,
            category_color=category.color if category else None,
            icon_color=entry.icon_color,
            created_at=entry.created_at,
            updated_at=entry.updated_at,
            support_contact=entry.support_contact,
            account_status=entry.account_status or "active"
        )
    finally:
        db.close()


@router.get("/search", response_model=SearchResponse)
def search_entries(q: str = ""):
    """Busca credenciales por título, usuario, URL, notas o categoría. Máximo 20 resultados."""
    query = q.strip().lower()
    if not query:
        return SearchResponse(results=[], count=0)

    query_escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

    db = _get_db()
    if not db:
        return SearchResponse(results=[], count=0)
    try:
        entries_query = db.query(Entry).outerjoin(Category, Entry.category_id == Category.id)
        entries_query = entries_query.filter(
            or_(
                Entry.title.ilike(f"%{query_escaped}%", escape="\\"),
                Entry.username.ilike(f"%{query_escaped}%", escape="\\"),
                Entry.url.ilike(f"%{query_escaped}%", escape="\\"),
                Entry.notes.ilike(f"%{query_escaped}%", escape="\\"),
                Category.name.ilike(f"%{query_escaped}%", escape="\\")
            )
        )
        entries_query = entries_query.order_by(Entry.title.asc()).limit(20)
        entries = entries_query.all()

        results = []
        for entry in entries:
            category = db.query(Category).filter(Category.id == entry.category_id).first() if entry.category_id else None
            results.append(EntryListItem(
                id=entry.id,
                title=entry.title,
                username=entry.username,
                url=entry.url,
                account_status=entry.account_status or "active",
                category_id=entry.category_id,
                category_name=category.name if category else None,
                category_color=category.color if category else None
            ))

        return SearchResponse(results=results, count=len(results))
    finally:
        db.close()


@router.post("/entries", response_model=dict)
def create_entry(entry_data: CreateEntryRequest):
    """Crea una nueva credencial en el vault. Solo título y contraseña son obligatorios."""
    db = _get_db()
    if not db:
        raise HTTPException(status_code=401, detail="no autenticado")
    try:
        new_entry = Entry(
            id=secrets.token_hex(16),
            title=entry_data.title,
            password=entry_data.password,
            username=entry_data.username,
            url=entry_data.url,
            totp_secret=entry_data.totp_secret,
            notes=entry_data.notes,
            category_id=entry_data.category_id,
            icon_color=entry_data.icon_color,
            support_contact=entry_data.support_contact,
            account_status=entry_data.account_status
        )
        db.add(new_entry)
        db.commit()
        db.refresh(new_entry)
        return {"status": "ok", "id": new_entry.id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="error al crear llave")
    finally:
        db.close()


@router.patch("/entries/{entry_id}")
def update_entry(entry_id: str, data: dict):
    """Actualiza parcialmente una credencial. Solo se modifican los campos proporcionados."""
    db = _get_db()
    if not db:
        raise HTTPException(status_code=401, detail="no autenticado")
    try:
        entry = db.query(Entry).filter(Entry.id == entry_id).first()
        if not entry:
            raise HTTPException(status_code=404, detail="llave no encontrada")

        updatable = ["title", "username", "password", "url", "totp_secret",
                      "notes", "category_id", "icon_color", "support_contact", "account_status"]

        for field in updatable:
            if field in data and data[field] is not None:
                setattr(entry, field, data[field])

        from datetime import datetime
        entry.updated_at = datetime.utcnow()

        db.commit()
        return {"status": "updated", "id": entry_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.delete("/entries/{entry_id}")
def delete_entry(entry_id: str):
    """Elimina una credencial del vault de forma permanente."""
    db = _get_db()
    if not db:
        raise HTTPException(status_code=401, detail="no autenticado")
    try:
        entry = db.query(Entry).filter(Entry.id == entry_id).first()
        if not entry:
            raise HTTPException(status_code=404, detail="llave no encontrada")

        db.delete(entry)
        db.commit()
        return {"status": "deleted", "id": entry_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()
