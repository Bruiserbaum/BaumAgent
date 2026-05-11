"""
GitNexus integration router.

Powered by GitNexus (https://github.com/abhigyanpatwari/GitNexus) —
an open-source code intelligence engine by Abhigyan Patwari.
"""
import asyncio
import json
from datetime import datetime, timezone
from urllib.parse import urlparse, urlunparse
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from redis import Redis
from rq import Queue
from sqlalchemy.orm import Session

from config import get_settings
from database import get_db
from dependencies import get_current_user
from models.task import Task, TaskStatus
from models.user import User
from routers.settings import _get_user_settings, _save_user_settings
from worker.job import run_task

router = APIRouter(prefix="/api/gitnexus", tags=["gitnexus"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_redis_queue() -> Queue:
    cfg = get_settings()
    return Queue("baumagent", connection=Redis.from_url(cfg.redis_url))


def _resolve_gitnexus_url(user: User, require_enabled: bool = True) -> str:
    settings = _get_user_settings(user)
    gn = settings.get("gitnexus", {})
    if require_enabled and not gn.get("enabled", False):
        raise HTTPException(status_code=400, detail="GitNexus is not enabled in settings.")
    return gn.get("url", "http://gitnexus:4747").rstrip("/")


def _inject_github_token(repo_url: str) -> str:
    """Rewrite a GitHub HTTPS URL to embed the BaumAgent GitHub token server-side."""
    cfg = get_settings()
    token = cfg.github_token
    if not token:
        return repo_url
    parsed = urlparse(repo_url)
    if parsed.hostname not in ("github.com", "www.github.com"):
        return repo_url
    authed = parsed._replace(netloc=f"x-access-token:{token}@{parsed.hostname}")
    return urlunparse(authed)


def _clean_url(repo_url: str) -> str:
    parsed = urlparse(repo_url)
    clean = parsed._replace(netloc=parsed.hostname or "")
    return urlunparse(clean).rstrip("/")


def _load_gn_settings(user: User) -> tuple[dict, dict]:
    user_settings = _get_user_settings(user)
    gn = user_settings.get("gitnexus", {})
    return user_settings, gn


def _save_tracked_repos(user: User, user_settings: dict, repos: list[dict], db: Session) -> None:
    gn = user_settings.get("gitnexus", {})
    gn["tracked_repos"] = repos
    user_settings["gitnexus"] = gn
    _save_user_settings(user, user_settings, db)


async def _poll_repo_status(gitnexus_url: str, repo: dict, client: httpx.AsyncClient) -> dict:
    job_id = repo.get("job_id")
    if not job_id or repo.get("status") in ("complete", "failed"):
        return repo
    try:
        resp = await client.get(f"{gitnexus_url}/api/analyze/{job_id}", timeout=5)
        if resp.status_code in (200, 202):
            data = resp.json()
            raw = data.get("status", "unknown")
            status_map = {
                "queued": "queued", "pending": "queued",
                "cloning": "running", "analyzing": "running", "running": "running",
                "completed": "complete", "complete": "complete",
                "failed": "failed",
            }
            repo = {**repo, "status": status_map.get(raw, "running")}
            if repo["status"] == "complete" and not repo.get("indexed_at"):
                repo["indexed_at"] = datetime.now(timezone.utc).isoformat()
    except Exception:
        pass
    return repo


def _create_health_scan_tasks(user: User, db: Session, tracked_repos: list[dict], user_settings: dict) -> list[str]:
    """Create a plan-only code task for every tracked repo. Returns the created task IDs."""
    cfg = get_settings()
    code_backend = user_settings.get("code_backend") or user_settings.get("default_llm_backend", cfg.default_llm_backend)
    code_model = user_settings.get("code_model") or user_settings.get("default_llm_model", cfg.default_llm_model)

    extra = json.dumps({
        "delivery_mode": "plan_only",
        "build_after_change": False,
        "create_release_artifacts": False,
        "publish_release": False,
        "update_docs": "never",
        "update_changelog": False,
        "health_scan": True,
    })

    queue = _get_redis_queue()
    task_ids: list[str] = []

    for repo in tracked_repos:
        repo_url = repo.get("url", "")
        if not repo_url:
            continue
        repo_name = repo_url.replace("https://github.com/", "").rstrip("/")
        task_id = str(uuid4())
        task = Task(
            id=task_id,
            description=(
                f"[Health Scan] Comprehensive bug and functionality audit of {repo_name}. "
                "Review the entire codebase for: bugs, logic errors, security vulnerabilities, "
                "error handling gaps, performance issues, and broken functionality. "
                "Do not commit any changes — produce a detailed audit report in the task log."
            ),
            repo_url=repo_url,
            base_branch="main",
            llm_backend=code_backend,
            llm_model=code_model,
            task_type="code",
            extra_data=extra,
            status=TaskStatus.QUEUED,
            log="",
            user_id=user.id,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        job = queue.enqueue(run_task, task.id, job_timeout=3600)
        task.rq_job_id = job.id
        db.commit()
        task_ids.append(task_id)

    return task_ids


def _record_scan_run(user: User, user_settings: dict, task_ids: list[str], db: Session) -> str:
    now = datetime.now(timezone.utc).isoformat()
    gn = user_settings.get("gitnexus", {})
    health = gn.get("health", {})
    health["last_scan_at"] = now
    runs: list[dict] = health.get("scan_runs", [])
    runs.insert(0, {"run_at": now, "task_ids": task_ids})
    health["scan_runs"] = runs[:10]
    gn["health"] = health
    user_settings["gitnexus"] = gn
    _save_user_settings(user, user_settings, db)
    return now


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
    user_settings, gn = _load_gn_settings(current_user)
    repos: list[dict] = gn.get("tracked_repos", [])
    if not repos:
        return []
    gitnexus_url = gn.get("url", "http://gitnexus:4747").rstrip("/")
    updated = []
    async with httpx.AsyncClient() as client:
        for repo in repos:
            updated.append(await _poll_repo_status(gitnexus_url, repo, client))
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
    gitnexus_url = _resolve_gitnexus_url(current_user)
    clean = _clean_url(req.repo_url)
    authed_url = _inject_github_token(req.repo_url)

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{gitnexus_url}/api/analyze", json={"url": authed_url})
        if not resp.is_success:
            body = resp.text
            raise HTTPException(status_code=502, detail=f"GitNexus error {resp.status_code}: {body}")
        data = resp.json()

    job_id = data.get("jobId")
    user_settings, gn = _load_gn_settings(current_user)
    repos: list[dict] = gn.get("tracked_repos", [])
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
    return await gitnexus_index(req, current_user, db)


@router.post("/sync-projects")
async def gitnexus_sync_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    gitnexus_url = _resolve_gitnexus_url(current_user)

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
                resp = await client.post(f"{gitnexus_url}/api/analyze", json={"url": authed})
                if not resp.is_success:
                    raise Exception(f"GitNexus {resp.status_code}: {resp.text}")
                data = resp.json()
                job_id = data.get("jobId")
                tracked_by_url[clean] = {"url": clean, "job_id": job_id, "status": "queued", "indexed_at": None}
                results.append({"url": clean, "job_id": job_id, "status": "queued"})
            except Exception as exc:
                results.append({"url": clean, "error": str(exc)})

    _save_tracked_repos(current_user, user_settings, list(tracked_by_url.values()), db)
    indexed = sum(1 for r in results if r.get("job_id") is not None)
    errors = sum(1 for r in results if "error" in r)
    return {"indexed": indexed, "errors": errors, "results": results}


# ---------------------------------------------------------------------------
# Health scan endpoints
# ---------------------------------------------------------------------------

@router.post("/scan")
async def trigger_scan(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Create plan-only audit tasks for every tracked repo and record the run."""
    user_settings, gn = _load_gn_settings(current_user)
    tracked: list[dict] = gn.get("tracked_repos", [])
    if not tracked:
        raise HTTPException(status_code=400, detail="No repos tracked. Add repos in the GitNexus settings first.")
    if not gn.get("enabled", False):
        raise HTTPException(status_code=400, detail="GitNexus is not enabled.")

    task_ids = _create_health_scan_tasks(current_user, db, tracked, user_settings)
    run_at = _record_scan_run(current_user, user_settings, task_ids, db)
    return {"task_ids": task_ids, "count": len(task_ids), "run_at": run_at}


class FixRequest(BaseModel):
    source_task_id: str


@router.post("/fix")
async def fix_scan_issues(
    req: FixRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Create a full (PR-mode) code task to fix issues found by a health scan task."""
    source = db.query(Task).filter(
        Task.id == req.source_task_id,
        Task.user_id == current_user.id,
    ).first()
    if source is None:
        raise HTTPException(status_code=404, detail="Source task not found.")
    if not source.description.startswith("[Health Scan]"):
        raise HTTPException(status_code=400, detail="Source task is not a health scan.")
    if source.status != TaskStatus.COMPLETE:
        raise HTTPException(status_code=400, detail="Health scan has not completed yet.")

    cfg = get_settings()
    user_settings, _ = _load_gn_settings(current_user)
    code_backend = user_settings.get("code_backend") or user_settings.get("default_llm_backend", cfg.default_llm_backend)
    code_model = user_settings.get("code_model") or user_settings.get("default_llm_model", cfg.default_llm_model)

    repo_name = (source.repo_url or "").replace("https://github.com/", "").rstrip("/")
    task_id = str(uuid4())
    extra = json.dumps({
        "delivery_mode": "pr_mode",
        "build_after_change": True,
        "create_release_artifacts": False,
        "publish_release": False,
        "update_docs": "if_needed",
        "update_changelog": True,
        "source_task_id": req.source_task_id,
        "health_fix": True,
    })

    task = Task(
        id=task_id,
        description=(
            f"[Health Fix] Address all bugs and issues found in health scan of {repo_name}. "
            "Review the audit findings and fix every identified bug, security vulnerability, "
            "error handling gap, and functionality issue. Open a pull request with all changes."
        ),
        repo_url=source.repo_url,
        base_branch=source.base_branch,
        llm_backend=code_backend,
        llm_model=code_model,
        task_type="code",
        extra_data=extra,
        status=TaskStatus.QUEUED,
        log="",
        user_id=current_user.id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    queue = _get_redis_queue()
    job = queue.enqueue(run_task, task.id, job_timeout=3600)
    task.rq_job_id = job.id
    db.commit()

    return {"task_id": task_id, "repo_url": source.repo_url}


@router.get("/scan/history")
async def scan_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Return the last 10 scan runs with live task statuses."""
    user_settings, gn = _load_gn_settings(current_user)
    health = gn.get("health", {})
    runs: list[dict] = health.get("scan_runs", [])

    result = []
    for run in runs:
        task_ids = run.get("task_ids", [])
        tasks = db.query(Task).filter(Task.id.in_(task_ids)).all() if task_ids else []
        result.append({
            "run_at": run["run_at"],
            "tasks": [
                {
                    "id": t.id,
                    "repo_url": t.repo_url,
                    "status": t.status,
                }
                for t in tasks
            ],
        })
    return result


# ---------------------------------------------------------------------------
# Index browser & GitHub import
# ---------------------------------------------------------------------------

class IndexSearchRequest(BaseModel):
    repo_url: str
    query: str
    limit: int = 10
    mode: str = "hybrid"


@router.get("/repo-info")
async def gitnexus_repo_info(
    repo_url: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Return GitNexus stats, processes, and clusters for an indexed repo."""
    gitnexus_url = _resolve_gitnexus_url(current_user)
    repo_name = _clean_url(repo_url).rstrip("/").split("/")[-1]

    async with httpx.AsyncClient(timeout=15) as client:
        repo_resp = await client.get(f"{gitnexus_url}/api/repo", params={"repo": repo_name})
        proc_resp = await client.get(f"{gitnexus_url}/api/processes", params={"repo": repo_name})
        clus_resp = await client.get(f"{gitnexus_url}/api/clusters", params={"repo": repo_name})

    return {
        "repo": repo_resp.json() if repo_resp.is_success else None,
        "processes": proc_resp.json() if proc_resp.is_success else [],
        "clusters": clus_resp.json() if clus_resp.is_success else [],
    }


@router.post("/search-index")
async def gitnexus_search_index(
    req: IndexSearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Proxy a hybrid search to GitNexus for a specific repo."""
    gitnexus_url = _resolve_gitnexus_url(current_user)
    repo_name = _clean_url(req.repo_url).rstrip("/").split("/")[-1]

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{gitnexus_url}/api/search", json={
            "query": req.query,
            "repo": repo_name,
            "limit": req.limit,
            "mode": req.mode,
        })
        if not resp.is_success:
            raise HTTPException(status_code=502, detail=f"GitNexus search error: {resp.text}")
        return resp.json()


@router.post("/import-github")
async def gitnexus_import_github(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Fetch all repos for the authenticated GitHub user and submit them to GitNexus."""
    gitnexus_url = _resolve_gitnexus_url(current_user)
    cfg = get_settings()
    token = cfg.github_token
    if not token:
        raise HTTPException(status_code=400, detail="No GitHub token configured.")

    all_repos: list[dict] = []
    page = 1
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            resp = await client.get(
                "https://api.github.com/user/repos",
                headers={"Authorization": f"token {token}", "User-Agent": "BaumAgent/1.0"},
                params={"per_page": 100, "page": page, "type": "all", "sort": "updated"},
            )
            if not resp.is_success:
                raise HTTPException(status_code=502, detail=f"GitHub API error: {resp.text}")
            batch = resp.json()
            if not batch:
                break
            all_repos.extend(batch)
            page += 1
            if len(batch) < 100:
                break

    user_settings, gn = _load_gn_settings(current_user)
    tracked: list[dict] = gn.get("tracked_repos", [])
    tracked_by_url = {_clean_url(r.get("url", "")): r for r in tracked}

    results: list[dict] = []
    async with httpx.AsyncClient(timeout=60) as client:
        for repo in all_repos:
            raw_url = repo.get("html_url", "").rstrip("/")
            if not raw_url:
                continue
            clean = _clean_url(raw_url)
            authed = _inject_github_token(raw_url)
            try:
                resp = await client.post(f"{gitnexus_url}/api/analyze", json={"url": authed})
                if not resp.is_success:
                    raise Exception(f"GitNexus {resp.status_code}: {resp.text}")
                data = resp.json()
                job_id = data.get("jobId")
                tracked_by_url[clean] = {"url": clean, "job_id": job_id, "status": "queued", "indexed_at": None}
                results.append({"url": clean, "name": repo.get("name", ""), "job_id": job_id, "status": "queued"})
            except Exception as exc:
                results.append({"url": clean, "name": repo.get("name", ""), "error": str(exc)})
            await asyncio.sleep(1)

    _save_tracked_repos(current_user, user_settings, list(tracked_by_url.values()), db)
    indexed = sum(1 for r in results if r.get("job_id") is not None)
    errors = sum(1 for r in results if "error" in r)
    return {"indexed": indexed, "errors": errors, "total": len(all_repos), "results": results}
