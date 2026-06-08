from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from src.modules.auth.routes import router as auth_router
from src.modules.vault.routes import router as vault_router
from src.modules.categories.routes import router as categories_router
from src.modules.recovery.routes import router as recovery_router
from src.modules.csv.routes import router as csv_router
from src.modules.config.routes import router as config_router
from src.config import ENV
import os

app = FastAPI(
    title="Millave API",
    description="API del gestor de contraseñas personal Millave",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

if ENV == "development":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(auth_router, prefix="/api")
app.include_router(vault_router, prefix="/api/vault")
app.include_router(categories_router, prefix="/api/categories")
app.include_router(recovery_router, prefix="/api/recovery")
app.include_router(csv_router, prefix="/api")
app.include_router(config_router, prefix="/api")

app.mount("/css", StaticFiles(directory="src/static/css"))
app.mount("/js", StaticFiles(directory="src/static/js"))
app.mount("/assets", StaticFiles(directory="src/static/assets"))

@app.get("/")
async def root():
    return FileResponse("src/static/index.html")

@app.get("/{full_path:path}")
async def catch_all(full_path: str):
    # No interceptar rutas de API
    if full_path.startswith("api/"):
        from starlette.responses import JSONResponse
        return JSONResponse({"detail": "not found"}, status_code=404)
    file_path = f"src/static/{full_path}"
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    return FileResponse("src/static/index.html")
