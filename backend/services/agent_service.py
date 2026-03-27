import base64
import json
import os
import re
import traceback
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from config import Settings
from models.task import Task, TaskStatus
from services.github_service import GitHubService
from services.llm import get_llm_client
from services.llm.base import ToolDefinition
from services import search_service
from routers.settings import get_doc_format


CODE_SYSTEM_PROMPT = (
    "You are BaumAgent, an autonomous AI software engineer. "
    "You have been given a task to complete on a GitHub repository. "
    "Use your tools to explore the codebase, understand what needs to change, "
    "make the changes, then call finish() with a summary. "
    "Be thorough: read relevant files before making changes. "
    "Use web_search when you need to look up APIs, docs, or examples. "
    "Always create clean, working code."
)

RESEARCH_SYSTEM_PROMPT = (
    "You are BaumAgent, an autonomous AI research assistant. "
    "You have been given a research task. "
    "Use web_search to find information, read_url to read specific pages, "
    "then call finish() with a structured report including title, sections "
    "(with headings and content), and sources. "
    "Be thorough and cite your sources."
)

# Tools available for code tasks
CODE_TOOL_DEFINITIONS: list[ToolDefinition] = [
    {
        "name": "list_dir",
        "description": "List files and directories at the given path (relative to repo root).",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path inside the repository. Use '.' for root.",
                }
            },
            "required": ["path"],
        },
    },
    {
        "name": "read_file",
        "description": "Read the contents of a file (relative to repo root). Returns up to 8000 characters.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file inside the repository.",
                }
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "Write content to a file (relative to repo root). Creates directories as needed.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file inside the repository.",
                },
                "content": {
                    "type": "string",
                    "description": "The full content to write to the file.",
                },
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "delete_file",
        "description": "Delete a file from the repository.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file to delete.",
                }
            },
            "required": ["path"],
        },
    },
    {
        "name": "web_search",
        "description": "Search the web using DuckDuckGo and return results.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query.",
                }
            },
            "required": ["query"],
        },
    },
    {
        "name": "read_url",
        "description": "Fetch and read content from a URL. Returns the first 3000 characters of the page text.",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL to fetch.",
                }
            },
            "required": ["url"],
        },
    },
    {
        "name": "finish",
        "description": "Signal that the task is complete. Call this when all changes are done.",
        "parameters": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "A summary of the changes made.",
                }
            },
            "required": ["summary"],
        },
    },
]

# Tools available for research tasks
RESEARCH_TOOL_DEFINITIONS: list[ToolDefinition] = [
    {
        "name": "web_search",
        "description": "Search the web using DuckDuckGo and return results.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query.",
                }
            },
            "required": ["query"],
        },
    },
    {
        "name": "read_url",
        "description": "Fetch and read content from a URL. Returns the first 3000 characters of the page text.",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL to fetch.",
                }
            },
            "required": ["url"],
        },
    },
    {
        "name": "finish",
        "description": (
            "Signal that research is complete. Call this with a structured report. "
            "sections is a list of {heading, content} objects. sources is a list of URLs."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "The title of the research report.",
                },
                "sections": {
                    "type": "array",
                    "description": "List of report sections.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "heading": {"type": "string"},
                            "content": {"type": "string"},
                        },
                        "required": ["heading", "content"],
                    },
                },
                "sources": {
                    "type": "array",
                    "description": "List of source URLs cited in the report.",
                    "items": {"type": "string"},
                },
            },
            "required": ["title", "sections", "sources"],
        },
    },
]

# Keep backward-compatible alias pointing to code tools
TOOL_DEFINITIONS = CODE_TOOL_DEFINITIONS


class AgentService:
    def __init__(self, task: Task, db: Session, settings: Settings) -> None:
        self._task = task
        self._db = db
        self._settings = settings
        self._repo_path: str = ""
        self._finished: bool = False
        self._research_result: dict | None = None

    # ------------------------------------------------------------------
    # Logging
    # ------------------------------------------------------------------

    def _log(self, message: str) -> None:
        print(message, flush=True)
        timestamp = datetime.now(timezone.utc).strftime("%H:%M:%S")
        line = f"[{timestamp}] {message}\n"
        self._task.log = (self._task.log or "") + line
        self._task.updated_at = datetime.now(timezone.utc)
        self._db.commit()

    # ------------------------------------------------------------------
    # Tool implementations
    # ------------------------------------------------------------------

    def _abs(self, path: str) -> str:
        """Resolve a repo-relative path to an absolute path."""
        return os.path.normpath(os.path.join(self._repo_path, path))

    def _tool_list_dir(self, path: str) -> str:
        abs_path = self._abs(path)
        if not os.path.exists(abs_path):
            return f"Path does not exist: {path}"
        entries = os.listdir(abs_path)
        lines = []
        for entry in sorted(entries):
            full = os.path.join(abs_path, entry)
            suffix = "/" if os.path.isdir(full) else ""
            lines.append(f"{entry}{suffix}")
        return "\n".join(lines) if lines else "(empty directory)"

    def _tool_read_file(self, path: str) -> str:
        abs_path = self._abs(path)
        if not os.path.isfile(abs_path):
            return f"File not found: {path}"
        try:
            with open(abs_path, "r", encoding="utf-8", errors="replace") as fh:
                content = fh.read(8000)
            if os.path.getsize(abs_path) > 8000:
                content += "\n... [truncated — file exceeds 8000 characters]"
            return content
        except Exception as exc:
            return f"Error reading file: {exc}"

    def _tool_write_file(self, path: str, content: str) -> str:
        abs_path = self._abs(path)
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        try:
            with open(abs_path, "w", encoding="utf-8") as fh:
                fh.write(content)
            return f"Written: {path}"
        except Exception as exc:
            return f"Error writing file: {exc}"

    def _tool_delete_file(self, path: str) -> str:
        abs_path = self._abs(path)
        if not os.path.isfile(abs_path):
            return f"File not found: {path}"
        try:
            os.remove(abs_path)
            return f"Deleted: {path}"
        except Exception as exc:
            return f"Error deleting file: {exc}"

    def _tool_web_search(self, query: str) -> str:
        try:
            return search_service.web_search(query)
        except Exception as exc:
            return f"Search error: {exc}"

    def _tool_read_url(self, url: str) -> str:
        try:
            resp = httpx.get(url, follow_redirects=True, timeout=10)
            text = resp.text
            # Strip HTML tags
            text = re.sub(r'<[^>]+>', '', text)
            # Collapse whitespace
            text = re.sub(r'\s+', ' ', text).strip()
            return text[:3000]
        except Exception as exc:
            return f"Error fetching URL: {exc}"

    def _tool_finish_code(self, summary: str) -> str:
        self._finished = True
        self._log(f"[finish] {summary}")
        return "Task complete."

    def _tool_finish_research(self, title: str, sections: list, sources: list) -> str:
        self._finished = True
        self._research_result = {
            "title": title,
            "sections": sections,
            "sources": sources,
        }
        self._log(f"[finish] Research complete: {title}")
        return "Research complete."

    # ------------------------------------------------------------------
    # Tool dispatcher
    # ------------------------------------------------------------------

    async def tool_executor(self, name: str, args: dict) -> str:
        if name == "list_dir":
            return self._tool_list_dir(args.get("path", "."))
        elif name == "read_file":
            return self._tool_read_file(args["path"])
        elif name == "write_file":
            return self._tool_write_file(args["path"], args["content"])
        elif name == "delete_file":
            return self._tool_delete_file(args["path"])
        elif name == "web_search":
            return self._tool_web_search(args["query"])
        elif name == "read_url":
            return self._tool_read_url(args["url"])
        elif name == "finish":
            task_type = getattr(self._task, "task_type", "code")
            if task_type == "research":
                return self._tool_finish_research(
                    title=args.get("title", "Research Report"),
                    sections=args.get("sections", []),
                    sources=args.get("sources", []),
                )
            else:
                return self._tool_finish_code(args.get("summary", ""))
        else:
            return f"Unknown tool: {name}"

    # ------------------------------------------------------------------
    # Build initial message (with optional image blocks)
    # ------------------------------------------------------------------

    def _build_initial_message(self, text: str):
        """Return str if no images, else a list of content blocks."""
        image_blocks = []
        image_paths = json.loads(self._task.images or "[]")
        for img_path in image_paths:
            full_path = f"/app/data/{img_path}"
            if os.path.exists(full_path):
                with open(full_path, "rb") as f:
                    b64 = base64.b64encode(f.read()).decode()
                ext = img_path.rsplit('.', 1)[-1].lower()
                media_type = {
                    "png": "image/png",
                    "jpg": "image/jpeg",
                    "jpeg": "image/jpeg",
                    "gif": "image/gif",
                    "webp": "image/webp",
                }.get(ext, "image/png")
                image_blocks.append({"type": "image", "data": b64, "media_type": media_type})

        if image_blocks:
            return [{"type": "text", "text": text}] + image_blocks
        return text  # plain str — no images

    # ------------------------------------------------------------------
    # Main run
    # ------------------------------------------------------------------

    async def run(self) -> None:
        task = self._task
        db = self._db
        settings = self._settings

        # 1. Mark task as running
        task.status = TaskStatus.RUNNING
        task.updated_at = datetime.now(timezone.utc)
        db.commit()
        self._log("Task started.")

        task_type = getattr(task, "task_type", "code")
        llm_client = get_llm_client(task.llm_backend, task.llm_model, settings)
        self._log(f"Starting agent loop with {task.llm_backend}/{task.llm_model}")

        if task_type == "research":
            await self._run_research(task, db, llm_client)
        else:
            await self._run_code(task, db, settings, llm_client)

    async def _run_research(self, task, db, llm_client) -> None:
        """Run a research task: web search + document generation, no GitHub."""
        initial_message_text = (
            f"Research task: {task.description}\n\n"
            "Search the web thoroughly, read relevant pages, then call finish() "
            "with a complete structured report."
        )
        initial_content = self._build_initial_message(initial_message_text)

        self._finished = False
        self._research_result = None

        await llm_client.run_agent_loop(
            system=RESEARCH_SYSTEM_PROMPT,
            initial_message=initial_content,
            tools=RESEARCH_TOOL_DEFINITIONS,
            tool_executor=self.tool_executor,
            log_fn=self._log,
        )

        # Generate document if research result is available
        if self._research_result:
            from services.research_service import generate_document
            output_format = getattr(task, "output_format", None) or "pdf"
            output_dir = f"/app/data/outputs/{task.id}"
            self._log(f"Generating {output_format.upper()} document ...")
            try:
                # Try to load user's doc format settings
                try:
                    from models.user import User as UserModel
                    from routers.settings import _get_user_settings, get_doc_format as _get_doc_fmt
                    _user = db.query(UserModel).filter(UserModel.id == task.user_id).first()
                    _user_cfg = _get_user_settings(_user) if _user else None
                    _fmt = _get_doc_fmt(_user_cfg)
                except Exception:
                    _fmt = get_doc_format()
                output_file = generate_document(
                    title=self._research_result["title"],
                    sections=self._research_result["sections"],
                    sources=self._research_result["sources"],
                    output_format=output_format,
                    output_dir=output_dir,
                    fmt=_fmt,
                )
                task.output_file = output_file
                db.commit()
                if os.path.exists(output_file):
                    size = os.path.getsize(output_file)
                    self._log(f"Document saved: {output_file} ({size} bytes)")
                else:
                    self._log(f"[ERROR] generate_document returned path but file does not exist: {output_file}")
                    task.output_file = None
                    db.commit()
            except Exception as _doc_err:
                self._log(f"[ERROR] Document generation failed: {_doc_err}\n{traceback.format_exc()}")
        else:
            self._log("WARNING: LLM did not call finish() — no research result to generate document from.")

        # Upload to SMB share if configured by user
        if task.output_file:
            try:
                from models.user import User as UserModel
                from routers.settings import _get_user_settings
                _smb_user = db.query(UserModel).filter(UserModel.id == task.user_id).first()
                if _smb_user:
                    _smb_user_cfg = _get_user_settings(_smb_user)
                    smb_cfg = _smb_user_cfg.get("smb", {})
                    if smb_cfg.get("enabled"):
                        from services.smb_service import upload_to_smb
                        unc = upload_to_smb(task.output_file, smb_cfg)
                        self._log(f"[smb] Uploaded to {unc}")
            except Exception as _smb_err:
                self._log(f"[smb] Upload failed (non-fatal): {_smb_err}")

        task.status = TaskStatus.COMPLETE
        task.updated_at = datetime.now(timezone.utc)
        db.commit()
        self._log("Done.")

    async def _run_code(self, task, db, settings, llm_client) -> None:
        """Run a code task: clone repo, apply changes, open PR."""
        # 2. Clone repo
        github_service = GitHubService(
            token=settings.github_token,
            user_name=settings.github_user_name,
            user_email=settings.github_user_email,
        )
        self._log(f"Cloning {task.repo_url} (branch: {task.base_branch}) ...")
        self._repo_path = github_service.clone(task.id, task.repo_url, task.base_branch)
        self._log(f"Cloned to {self._repo_path}")

        # 3. Run LLM agent loop
        self._finished = False
        initial_message_text = (
            f"Task: {task.description}\n"
            f"Repo: {task.repo_url}\n\n"
            "Start by listing the repository structure."
        )
        initial_content = self._build_initial_message(initial_message_text)

        await llm_client.run_agent_loop(
            system=CODE_SYSTEM_PROMPT,
            initial_message=initial_content,
            tools=CODE_TOOL_DEFINITIONS,
            tool_executor=self.tool_executor,
            log_fn=self._log,
        )

        # 4. Check for changes
        from git import Repo as GitRepo
        repo = GitRepo(self._repo_path)
        if not repo.is_dirty(untracked_files=True):
            self._log("WARNING: No changes detected in repository after agent loop.")

        # 5. Create branch, commit, push
        branch_name = f"baumagent/{task.id[:8]}"
        self._log(f"Creating branch {branch_name} ...")
        github_service.create_branch(self._repo_path, branch_name)

        commit_message = f"baumagent: {task.description[:72]}\n\nTask-ID: {task.id}"
        self._log("Committing changes ...")
        commit_sha = github_service.commit_all(self._repo_path, commit_message)
        self._log(f"Committed: {commit_sha}")

        self._log("Pushing branch ...")
        github_service.push(self._repo_path, branch_name)

        # 6. Ask LLM for PR description
        self._log("Generating PR description ...")
        pr_description_prompt = (
            f"Write a concise GitHub pull request description for the following task.\n\n"
            f"Task: {task.description}\n"
            f"Repo: {task.repo_url}\n\n"
            "Include: what was changed and why. Use Markdown. Be concise."
        )
        pr_body = await llm_client.run_agent_loop(
            system="You are a helpful assistant that writes clear pull request descriptions.",
            initial_message=pr_description_prompt,
            tools=[],
            tool_executor=self.tool_executor,
            log_fn=lambda _: None,
        )

        # 7. Open PR
        pr_title = task.description[:72]
        self._log(f"Opening PR: {pr_title}")
        pr_url, pr_number = github_service.open_pr(
            repo_url=task.repo_url,
            branch_name=branch_name,
            base_branch=task.base_branch,
            title=pr_title,
            body=pr_body or task.description,
        )
        self._log(f"PR opened: {pr_url}")

        # 8. Update task to complete
        task.status = TaskStatus.COMPLETE
        task.branch_name = branch_name
        task.pr_url = pr_url
        task.pr_number = pr_number
        task.commit_sha = commit_sha
        task.updated_at = datetime.now(timezone.utc)
        db.commit()

        # 9. Cleanup
        github_service.cleanup(self._repo_path)
        self._log("Done.")
