from fastapi import APIRouter, Depends
import httpx

from config import get_settings
from dependencies import get_current_user

router = APIRouter(tags=["repos"])


@router.get("/api/repos")
def list_repos(current_user=Depends(get_current_user)):
    """Return repos accessible with the configured GitHub token, sorted by last push."""
    settings = get_settings()
    token = settings.github_token
    if not token:
        return []

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    repos: list[dict] = []
    page = 1
    while True:
        resp = httpx.get(
            "https://api.github.com/user/repos",
            headers=headers,
            params={"per_page": 100, "page": page, "sort": "pushed", "affiliation": "owner,collaborator"},
            timeout=15,
        )
        if resp.status_code != 200:
            break
        batch = resp.json()
        if not batch:
            break
        for r in batch:
            repos.append({
                "name": r["name"],
                "full_name": r["full_name"],
                "html_url": r["html_url"],
                "default_branch": r.get("default_branch", "main"),
                "private": r.get("private", False),
                "description": r.get("description") or "",
            })
        if len(batch) < 100:
            break
        page += 1

    return repos
