"""
GitNexus integration router.

Powered by GitNexus (https://github.com/abhigyanpatwari/GitNexus) —
an open-source code intelligence engine by Abhigyan Patwari.
"""
import json
from datetime import datetime, timezone
from urllib.parse import urlparse, urlunparse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config import get_settings
from database import get_db
from dependencies import get_current_user
from models.user import User
from routers.settings import _get_user_settings, _save_user_settings

router = APIRouter(prefix="/api/gitnexus", tags=["gitnexus"])


def _resolve_gitnexus_url(user: User, require_enabled: bool = True) -> str:
    settings = _get_user_settings(user)
    gn = settings.get("gitnexus", {})
    if require_enabled and not gn.get("enabled", False):
        raise HTTPException(status_code=400, detail="GitNexus is not enabled in settings.")
    return gn.get("url", "http://gitnexus:4747").rstrip("/")


def _inject_github_token(repo_url: str) -> str:
    """Rewrite a GitHub HTTPS URL to embed the BaumAgent GitHub token.

    https://github.com/user/repo  →  https://<token>@github.com/user/repo

    Only applied to github.com URLs; other hosts are returned unchanged.
    The token is never stored or returned to the client — it exists only
    for the outbound request to GitNexus.
    """
    cfg = get_settings()
    token = cfg.github_token
    if not token:
        return repo_url
    parsed = urlparse(repo_url)
    if parsed.hostname not in ("github.com", "www.github.com"):
        return repo_url
    authed = parsed._replace(netloc=f"{token}@{parsed.hostname}")
    return urlunparse(authed)


def _clean_url(repo_url: str) -> str:
    """Return the repo URL without any embedded credentials."""
    parsed = urlparse(repo_url)
    clean = parsed._replace(netloc=parsed.hostname or "")
    return urlunparse(clean).rstrip("/")


def _load_gn_settings(user: User) -> tuple[dict, dict]:
    """Return (full_user_settings, gitnexus_sub_dict)."""
    user_settings = _get_user_settings(user)
    gn = user_settings.get("gitnexus", {})
    return user_settings, gn


def _save_tracked_repos(user: User, user_settings: dict, repos: list[dict], db: Session) -> None:
    gn = user_settings.get("gitnexus", {})
    gn["tracked_repos"] = repos
    user_settings["gitnexus"] = gn
    _save_user_settings(user, user_settings, db)


async def _poll_repo_status(gitnexus_url: str, repo: dict, client: httpx.AsyncClient) -> dict:
    """Fetch current job status from GitNexus and merge into the repo dict."""
    job_id = repo.get("job_id")
    if not job_id or repo.get("status") in ("complete", "failed"):
        return repo
    try:
        resp = await client.get(f"{gitnexus_url}/api/analyze/{job_id}", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            raw_status = data.get("status", "unknown")
            # GitNexus statuses: pending / running / completed / failed
            status_map = {"pending": "queued", "running": "running", "completed": "complete", "failed": "failed"}
            repo = {**repo, "status": status_map.get(raw_status, raw_status)}
            if repo["status"] == "complete" and not repo.get("indexed_at"):
                repo["indexed_at"] = datetime.now(timezone.utc).isoformat()
    except Exception:
        pass
    return repo


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/status")
async def gitnexus_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    user_settings, gn = _load_gn_settings(current_user)
    enabled = gn.get("enabled", False)
    if not enabled:
        return {"connected": False, "enabled": False}
    url = gn.get("url", "http://gitnexus:4747").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{url}/")
            if resp.status_code < 500:
                return {"connected": True, "enabled": True, "url": url}
    except Exception:
        pass
    return {"connected": False, "enabled": True, "url": url}


@router.get("/repos")
async def gitnexus_list_repos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Return tracked repos with live status polled from GitNexus."""
    user_settings, gn = _load_gn_settings(current_user)
    repos: list[dict] = gn.get("tracked_repos", [])
    if not repos:
        return []

    gitnexus_url = gn.get("url", "http://gitnexus:4747").rstrip("/")
    updated = []
    async with httpx.AsyncClient() as client:
        for repo in repos:
            updated.append(await _poll_repo_status(gitnexus_url, repo, client))

    # Persist any status changes
    _save_tracked_repos(current_user, user_settings, updated, db)
    return updated


class IndexRequest(BaseModel):
    repo_url: str


@router.post("/index")
async def gitnexus_index(
    req: IndexRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Queue a single repo for indexing and track it."""
    gitnexus_url = _resolve_gitnexus_url(current_user)
    clean = _clean_url(req.repo_url)
    authed_url = _inject_github_token(req.repo_url)

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{gitnexus_url}/api/analyze", json={"repoUrl": authed_url})
        resp.raise_for_status()
        data = resp.json()

    job_id = data.get("jobId")
    user_settings, gn = _load_gn_settings(current_user)
    repos: list[dict] = gn.get("tracked_repos", [])

    # Upsert: replace existing entry for this URL if present
    repos = [r for r in repos if _clean_url(r.get("url", "")) != clean]
    repos.append({"url": clean, "job_id": job_id, "status": "queued", "indexed_at": None})
    _save_tracked_repos(current_user, user_settings, repos, db)

    return {"url": clean, "job_id": job_id, "status": "queued"}


@router.get("/index/{job_id}")
async def gitnexus_index_status(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    gitnexus_url = _resolve_gitnexus_url(current_user)
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{gitnexus_url}/api/analyze/{job_id}")
        resp.raise_for_status()
        return resp.json()


@router.delete("/repos")
async def gitnexus_remove_repo(
    req: IndexRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Remove a repo from the tracked list."""
    clean = _clean_url(req.repo_url)
    user_settings, gn = _load_gn_settings(current_user)
    repos: list[dict] = gn.get("tracked_repos", [])
    repos = [r for r in repos if _clean_url(r.get("url", "")) != clean]
    _save_tracked_repos(current_user, user_settings, repos, db)
    return {"removed": clean}


@router.post("/repos/reindex")
async def gitnexus_reindex_repo(
    req: IndexRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Re-trigger indexing for an already-tracked repo."""
    return await gitnexus_index(req, current_user, db)


@router.post("/sync-projects")
async def gitnexus_sync_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Queue all unique repo URLs from task history for indexing."""
    gitnexus_url = _resolve_gitnexus_url(current_user)
    from models.task import Task

    rows = (
        db.query(Task.repo_url)
        .filter(Task.user_id == current_user.id, Task.repo_url.isnot(None), Task.repo_url != "")
        .distinct()
        .all()
    )
    repo_urls = [row[0] for row in rows]

    user_settings, gn = _load_gn_settings(current_user)
    tracked: list[dict] = gn.get("tracked_repos", [])
    tracked_by_url = {_clean_url(r.get("url", "")): r for r in tracked}

    results = []
    async with httpx.AsyncClient(timeout=30) as client:
        for raw_url in repo_urls:
            clean = _clean_url(raw_url)
            authed = _inject_github_token(raw_url)
            try:
                resp = await client.post(f"{gitnexus_url}/api/analyze", json={"repoUrl": authed})
                resp.raise_for_status()
                data = resp.json()
                job_id = data.get("jobId")
                tracked_by_url[clean] = {"url": clean, "job_id": job_id, "status": "queued", "indexed_at": None}
                results.append({"url": clean, "job_id": job_id, "status": "queued"})
            except Exception as exc:
                results.append({"url": clean, "error": str(exc)})

    _save_tracked_repos(current_user, user_settings, list(tracked_by_url.values()), db)

    indexed = sum(1 for r in results if "job_id" in r)
    errors = sum(1 for r in results if "error" in r)
    return {"indexed": indexed, "errors": errors, "results": results}
