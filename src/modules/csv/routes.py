from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from src.database.connection import get_engine
from src.database.models import Entry, Category
from src.modules.auth.routes import _active_sessions
import csv
import io
import secrets

router = APIRouter()

CSV_FIELDS = ["title", "username", "password", "url", "totp_secret", "notes", "category", "support_contact", "account_status"]

CSV_HEADERS_ES = ["titulo", "usuario", "contraseña", "url", "semilla_totp", "notas", "categoria", "contacto_soporte", "estado_cuenta"]


def _get_db():
    for session_data in _active_sessions.values():
        if isinstance(session_data, dict) and "encryption_key" in session_data:
            engine = get_engine(session_data["encryption_key"])
            return Session(bind=engine)
    return None


@router.get("/csv/template")
def download_template():
    """Descarga una plantilla CSV con los campos correctos para importar credenciales."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(CSV_HEADERS_ES)

    writer.writerow([
        "gmail personal",
        "usuario@gmail.com",
        "MiContraseña123!",
        "https://mail.google.com",
        "",
        "cuenta principal",
        "general",
        "soporte@google.com",
        "activa"
    ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=millave_plantilla.csv"}
    )


@router.get("/csv/export")
def export_entries():
    """Exporta todas las credenciales del vault como archivo CSV."""
    db = _get_db()
    if not db:
        raise HTTPException(status_code=401, detail="no autenticado")
    try:
        entries = db.query(Entry).all()
        categories = {c.id: c.name for c in db.query(Category).all()}

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(CSV_HEADERS_ES)

        for entry in entries:
            category_name = categories.get(entry.category_id, "general")
            writer.writerow([
                entry.title or "",
                entry.username or "",
                entry.password or "",
                entry.url or "",
                entry.totp_secret or "",
                entry.notes or "",
                category_name,
                entry.support_contact or "",
                entry.account_status or "active"
            ])

        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=millave_export.csv"}
        )
    finally:
        db.close()


@router.post("/csv/import")
def import_entries(file: UploadFile = File(...)):
    """Importa credenciales desde un archivo CSV. Crea categorías nuevas si no existen."""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="el archivo debe ser un CSV")

    db = _get_db()
    if not db:
        raise HTTPException(status_code=401, detail="no autenticado")

    try:
        content = file.file.read().decode('utf-8')
        reader = csv.DictReader(io.StringIO(content))

        imported = 0
        errors = []

        for i, row in enumerate(reader, start=2):
            title = row.get("titulo", "").strip()
            password = row.get("contraseña", "").strip()

            if not title or not password:
                errors.append(f"fila {i}: título y contraseña son obligatorios")
                continue

            category_name = row.get("categoria", "general").strip() or "general"
            category = db.query(Category).filter(Category.name == category_name).first()
            if not category:
                cat_id = secrets.token_hex(8)
                max_order = db.query(Category.sort_order).order_by(Category.sort_order.desc()).first()
                next_order = (max_order[0] + 1) if max_order and max_order[0] is not None else 0
                category = Category(id=cat_id, name=category_name, color="#78716c", sort_order=next_order)
                db.add(category)
                db.flush()

            status_map = {
                "activa": "active",
                "inactiva": "inactive",
                "suspendida": "suspended",
                "en prueba": "trial",
                "cerrada": "closed",
                "active": "active",
                "inactive": "inactive",
                "suspended": "suspended",
                "trial": "trial",
                "closed": "closed"
            }
            account_status = status_map.get(row.get("estado_cuenta", "activa").strip().lower(), "active")

            entry_id = secrets.token_hex(16)
            entry = Entry(
                id=entry_id,
                title=title,
                username=row.get("usuario", "").strip() or None,
                password=password,
                url=row.get("url", "").strip() or None,
                totp_secret=row.get("semilla_totp", "").strip() or None,
                notes=row.get("notas", "").strip() or None,
                category_id=category.id,
                support_contact=row.get("contacto_soporte", "").strip() or None,
                account_status=account_status
            )
            db.add(entry)
            imported += 1

        db.commit()
        return {"status": "imported", "imported": imported, "errors": errors}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"error al importar: {str(e)}")
    finally:
        db.close()
