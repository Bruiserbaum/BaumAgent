import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from database import init_db
from models import user as user_model, project as project_model  # noqa: F401 — ensures tables are created
from routers import tasks, logs, settings as settings_router, users, projects


STATIC_DIR = "/app/static"
INDEX_HTML = os.path.join(STATIC_DIR, "index.html")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="BaumAgent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routers
app.include_router(tasks.router)
app.include_router(logs.router)
app.include_router(settings_router.router)
app.include_router(users.router)
app.include_router(projects.router)

# Serve frontend static assets if the build exists
_assets_dir = os.path.join(STATIC_DIR, "assets")
if os.path.isdir(_assets_dir):
    app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")


# Catch-all for React SPA routing
@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    if os.path.isfile(INDEX_HTML):
        return FileResponse(INDEX_HTML)
    return JSONResponse({"message": "BaumAgent API running"})
