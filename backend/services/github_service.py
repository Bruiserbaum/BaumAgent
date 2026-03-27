import re
import shutil
from urllib.parse import urlparse

import httpx
from git import Repo


class GitHubService:
    def __init__(
        self,
        token: str,
        user_name: str,
        user_email: str,
        work_dir: str = "/app/repos",
    ) -> None:
        self._token = token
        self._user_name = user_name
        self._user_email = user_email
        self._work_dir = work_dir

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _inject_token(self, repo_url: str) -> str:
        """Inject GitHub token into HTTPS URL."""
        parsed = urlparse(repo_url)
        if parsed.scheme in ("http", "https") and self._token:
            authed = parsed._replace(netloc=f"{self._token}@{parsed.netloc}")
            return authed.geturl()
        return repo_url

    @staticmethod
    def _parse_owner_repo(repo_url: str) -> tuple[str, str]:
        """Extract owner and repo name from a GitHub URL."""
        # Support https://github.com/owner/repo[.git] and git@github.com:owner/repo[.git]
        match = re.search(r"[:/]([^/]+)/([^/]+?)(?:\.git)?$", repo_url)
        if not match:
            raise ValueError(f"Cannot parse owner/repo from URL: {repo_url}")
        return match.group(1), match.group(2)

    def _repo_local_path(self, task_id: str) -> str:
        return f"{self._work_dir}/{task_id}"

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def clone(self, task_id: str, repo_url: str, base_branch: str) -> str:
        """Clone the repository and return the local path."""
        local_path = self._repo_local_path(task_id)
        # Remove stale clone from a previous failed/cancelled run
        if shutil.os.path.exists(local_path):
            shutil.rmtree(local_path, ignore_errors=True)
        authed_url = self._inject_token(repo_url)
        repo = Repo.clone_from(authed_url, local_path, branch=base_branch)
        with repo.config_writer() as cw:
            cw.set_value("user", "name", self._user_name)
            cw.set_value("user", "email", self._user_email)
        return local_path

    def create_branch(self, repo_path: str, branch_name: str) -> None:
        repo = Repo(repo_path)
        repo.git.checkout("-b", branch_name)

    def commit_all(self, repo_path: str, message: str) -> str:
        """Stage all changes, create a commit and return the commit SHA."""
        repo = Repo(repo_path)
        repo.git.add("-A")
        repo.index.commit(message)
        return repo.head.commit.hexsha

    def push(self, repo_path: str, branch_name: str) -> None:
        repo = Repo(repo_path)
        repo.git.push("origin", branch_name)

    def open_pr(
        self,
        repo_url: str,
        branch_name: str,
        base_branch: str,
        title: str,
        body: str,
    ) -> tuple[str, int]:
        """Create a pull request and return (pr_url, pr_number)."""
        owner, repo_name = self._parse_owner_repo(repo_url)
        api_url = f"https://api.github.com/repos/{owner}/{repo_name}/pulls"
        headers = {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        payload = {
            "title": title,
            "body": body,
            "head": branch_name,
            "base": base_branch,
        }
        resp = httpx.post(api_url, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return data["html_url"], data["number"]

    def cleanup(self, repo_path: str) -> None:
        shutil.rmtree(repo_path, ignore_errors=True)
