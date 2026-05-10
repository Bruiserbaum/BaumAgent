"""
GitNexus integration router.

Powered by GitNexus (https://github.com/abhigyanpatwari/GitNexus) —
an open-source code intelligence engine by Abhigyan Patwari.
"""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models.user import User
from routers.settings import _get_user_settings

router = APIRouter(prefix="/api/gitnexus", tags=["gitnexus"])


def _resolve_url(user: User, require_enabled: bool = True) -> str:
    settings = _get_user_settings(user)
    gn = settings.get("gitnexus", {})
    if require_enabled and not gn.get("enabled", False):
        raise HTTPException(status_code=400, detail="GitNexus is not enabled in settings.")
    return gn.get("url", "http://gitnexus:4747").rstrip("/")


@router.get("/status")
async def gitnexus_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    settings = _get_user_settings(current_user)
    gn = settings.get("gitnexus", {})
    enabled = gn.get("enabled", False)
    if not enabled:
        return {"connected": False, "enabled": False}
    url = gn.get("url", "http://gitnexus:4747").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            # GitNexus has no dedicated health endpoint; any HTTP response means it's running
            resp = await client.get(f"{url}/")
            if resp.status_code < 500:
                return {"connected": True, "enabled": True, "url": url}
    except Exception:
        pass
    return {"connected": False, "enabled": True, "url": url}


class IndexRequest(BaseModel):
    repo_url: str


@router.post("/index")
async def gitnexus_index(
    req: IndexRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    url = _resolve_url(current_user)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{url}/api/analyze", json={"repoUrl": req.repo_url})
        resp.raise_for_status()
        return resp.json()


@router.get("/index/{job_id}")
async def gitnexus_index_status(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    url = _resolve_url(current_user)
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{url}/api/analyze/{job_id}")
        resp.raise_for_status()
        return resp.json()


@router.post("/sync-projects")
async def gitnexus_sync_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    url = _resolve_url(current_user)
    from models.task import Task

    # Collect unique repo URLs from all tasks belonging to this user
    tasks = (
        db.query(Task.repo_url)
        .filter(Task.user_id == current_user.id, Task.repo_url.isnot(None), Task.repo_url != "")
        .distinct()
        .all()
    )
    repos = [row[0] for row in tasks]

    results = []
    async with httpx.AsyncClient(timeout=30) as client:
        for repo_url in repos:
            try:
                resp = await client.post(f"{url}/api/analyze", json={"repoUrl": repo_url})
                resp.raise_for_status()
                data = resp.json()
                results.append({"repo_url": repo_url, "job_id": data.get("jobId"), "status": "queued"})
            except Exception as exc:
                results.append({"repo_url": repo_url, "error": str(exc)})

    indexed = sum(1 for r in results if "job_id" in r)
    errors = sum(1 for r in results if "error" in r)
    return {"indexed": indexed, "errors": errors, "results": results}
