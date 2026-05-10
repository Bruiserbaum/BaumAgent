import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from database import init_db
from models import user as user_model, project as project_model  # noqa: F401 — ensures tables are created
import models.api_token   # noqa: F401
import models.push_token  # noqa: F401
from routers import (
    tasks, logs,
    settings as settings_router,
    users, projects, chat,
    queue as queue_router,
    repos as repos_router,
    auth as auth_router,
    push as push_router,
    gitnexus as gitnexus_router,
)


STATIC_DIR = "/app/static"
INDEX_HTML = os.path.join(STATIC_DIR, "index.html")


async def _health_scan_scheduler() -> None:
    """Hourly background loop — fires scheduled GitNexus health scans for all users."""
    await asyncio.sleep(60)  # brief startup delay
    while True:
        try:
            now = datetime.now(timezone.utc)
            from database import SessionLocal
            from models.user import User
            from routers.settings import _get_user_settings
            from routers.gitnexus import _create_health_scan_tasks, _load_gn_settings, _record_scan_run

            db = SessionLocal()
            try:
                for user in db.query(User).all():
                    user_settings, gn = _load_gn_settings(user)
                    if not gn.get("enabled", False):
                        continue
                    health = gn.get("health", {})
                    if not health.get("schedule_enabled", False):
                        continue
                    if now.weekday() != health.get("day_of_week", 1):
                        continue
                    if now.hour != health.get("scan_hour", 2):
                        continue
                    last = health.get("last_scan_at")
                    if last and (now - datetime.fromisoformat(last)).days < 6:
                        continue
                    tracked = gn.get("tracked_repos", [])
                    if tracked:
                        task_ids = _create_health_scan_tasks(user, db, tracked, user_settings)
                        _record_scan_run(user, user_settings, task_ids, db)
            finally:
                db.close()
        except Exception:
            pass
        await asyncio.sleep(3600)  # check again in one hour


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    scheduler = asyncio.create_task(_health_scan_scheduler())
    yield
    scheduler.cancel()


app = FastAPI(title="BaumAgent", lifespan=lifespan)


@app.get("/api/health", include_in_schema=False)
async def health():
    return {"status": "ok", "service": "BaumAgent"}


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
app.include_router(chat.router)
app.include_router(queue_router.router)
app.include_router(repos_router.router)
app.include_router(auth_router.router)
app.include_router(push_router.router)
app.include_router(gitnexus_router.router)

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
