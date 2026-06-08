from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session
from src.database.connection import get_engine
from src.database.models import Category, Entry
from src.modules.auth.routes import _active_sessions
import secrets

router = APIRouter()


def _get_db():
    for session_data in _active_sessions.values():
        if isinstance(session_data, dict) and "encryption_key" in session_data:
            engine = get_engine(session_data["encryption_key"])
            return Session(bind=engine)
    return None


@router.get("")
def list_categories():
    """Lista todas las categorías con el conteo de credenciales asociadas."""
    db = _get_db()
    if not db:
        return []
    try:
        categories = db.query(Category).order_by(Category.sort_order.asc()).all()
        result = []
        for cat in categories:
            count = db.query(Entry).filter(Entry.category_id == cat.id).count()
            result.append({
                "id": cat.id,
                "name": cat.name,
                "color": cat.color,
                "sort_order": cat.sort_order,
                "entry_count": count
            })
        return result
    finally:
        db.close()


@router.post("")
def create_category(data: dict):
    """Crea una nueva categoría con nombre y color. El nombre debe ser único."""
    name = data.get("name", "").strip()
    color = data.get("color", "#78716c")

    if not name:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")

    db = _get_db()
    if not db:
        raise HTTPException(status_code=401, detail="no autenticado")
    try:
        existing = db.query(Category).filter(Category.name == name).first()
        if existing:
            raise HTTPException(status_code=409, detail="Ya existe una categoría con ese nombre")

        max_order = db.query(Category.sort_order).order_by(Category.sort_order.desc()).first()
        next_order = (max_order[0] + 1) if max_order and max_order[0] is not None else 0

        cat_id = secrets.token_hex(8)
        category = Category(id=cat_id, name=name, color=color, sort_order=next_order)
        db.add(category)
        db.commit()
        return {"status": "created", "id": cat_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.patch("/{category_id}")
def update_category(category_id: str, data: dict):
    """Actualiza el nombre o color de una categoría existente."""
    db = _get_db()
    if not db:
        raise HTTPException(status_code=401, detail="no autenticado")
    try:
        category = db.query(Category).filter(Category.id == category_id).first()
        if not category:
            raise HTTPException(status_code=404, detail="Categoría no encontrada")

        if "name" in data and data["name"]:
            new_name = data["name"].strip()
            if not new_name:
                raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")

            existing = db.query(Category).filter(Category.name == new_name, Category.id != category_id).first()
            if existing:
                raise HTTPException(status_code=409, detail="Ya existe una categoría con ese nombre")

            category.name = new_name

        if "color" in data:
            category.color = data["color"]

        db.commit()
        return {"status": "updated", "id": category_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.delete("/{category_id}")
def delete_category(category_id: str, data: dict = None):
    """Elimina una categoría. Las credenciales asociadas se reasignan a 'general' o se eliminan según la acción indicada."""
    db = _get_db()
    if not db:
        raise HTTPException(status_code=401, detail="no autenticado")
    try:
        category = db.query(Category).filter(Category.id == category_id).first()
        if not category:
            raise HTTPException(status_code=404, detail="Categoría no encontrada")

        if category.id == "general":
            raise HTTPException(status_code=400, detail="No se puede eliminar la categoría general")

        entry_count = db.query(Entry).filter(Entry.category_id == category_id).count()

        action = data.get("action", "reassign") if data else "reassign"
        target_id = data.get("target_id", "general") if data else "general"

        if action == "reassign":
            db.query(Entry).filter(Entry.category_id == category_id).update(
                {Entry.category_id: target_id}, synchronize_session=False
            )
        elif action == "delete_entries":
            db.query(Entry).filter(Entry.category_id == category_id).delete(
                synchronize_session=False
            )

        db.delete(category)
        db.commit()
        return {"status": "deleted", "id": category_id, "affected_entries": entry_count}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()
