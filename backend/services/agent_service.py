import base64
import json
import os
import re
import traceback
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import httpx
from sqlalchemy.orm import Session

from config import Settings
from models.task import Task, TaskStatus
from services.github_service import GitHubService
from services.llm import get_llm_client
from services.llm.base import ToolDefinition
from services import search_service
from routers.settings import get_doc_format


def _build_code_system_prompt(opts: dict) -> str:
    """Build the Github Coding system prompt dynamically based on task options."""
    delivery_mode = opts.get("delivery_mode", "pr_mode")
    build_after = opts.get("build_after_change", True)
    create_artifacts = opts.get("create_release_artifacts", False)
    publish_release = opts.get("publish_release", True)
    update_docs = opts.get("update_docs", "if_needed")
    update_changelog = opts.get("update_changelog", True)

    parts = [
        "You are BaumAgent, an autonomous AI software engineer working on a GitHub repository.\n",
        "STEP 1 — INSPECT\n"
        "Before touching any file:\n"
        "- Read README and main project configuration files (package.json, pyproject.toml, Cargo.toml, etc.)\n"
        "- Identify the language, framework, build/test commands, and overall code layout\n"
        "- Locate the files most likely relevant to the requested change\n",
        "STEP 2 — PLAN\n"
        "Create a brief internal implementation plan:\n"
        "- List the files that will change and why\n"
        "- Describe the behaviour being added or modified\n"
        "- Do not open a pull request yet\n",
        "STEP 3 — IMPLEMENT\n"
        "Make the code changes:\n"
        "- Edit only files directly relevant to the task\n"
        "- Preserve existing code style and patterns\n"
        "- Avoid unrelated refactors unless they are strictly required\n",
    ]

    if build_after:
        parts.append(
            "STEP 4 — VALIDATE\n"
            "After making changes:\n"
            "- Run linting if a linter is configured (eslint, ruff, pylint, etc.)\n"
            "- Run the test suite if tests exist\n"
            "- Run the build if applicable (npm run build, cargo build, dotnet build, etc.)\n"
            "- Record any failures clearly in your finish() summary\n"
        )

    parts.append(
        "STEP 5 — VERIFY\n"
        "Before delivering:\n"
        "- Confirm git diff is non-empty; if no files changed stop and call finish() reporting failure\n"
        "- Summarise every changed file and the reason it changed\n"
    )

    if update_changelog:
        parts.append(
            "STEP 6 — CHANGELOG\n"
            "Add an entry to CHANGELOG.md (create it if absent) describing what changed, why, "
            "and which version it targets. Keep existing entries intact.\n"
        )

    docs_instruction = {
        "always": "Update README.md and any relevant docs unconditionally.",
        "if_needed": "Update README.md and docs only when the change affects setup, usage, CLI flags, or public API.",
        "never": "Do not modify documentation files.",
    }.get(update_docs, "Update README.md if the change affects setup or usage.")
    parts.append(f"STEP 7 — DOCS\n{docs_instruction}\n")

    if create_artifacts:
        artifact_note = (
            "STEP 8 — RELEASE ARTIFACTS\n"
            "Build release/installer artifacts if a build script exists "
            "(install.sh, setup.py, Makefile, .nsis, .iss, CMakeLists.txt, build.gradle, pom.xml). "
            "Increment the version (patch bump unless a significant feature → minor bump).\n"
        )
        if publish_release:
            artifact_note += "After building, create a GitHub release tag and publish it.\n"
        parts.append(artifact_note)
    else:
        # Still version-bump if there's a version file
        parts.append(
            "STEP 8 — VERSION\n"
            "Search for a version file (package.json, setup.py, pyproject.toml, Cargo.toml, VERSION, "
            "version.txt, __version__.py, AssemblyInfo.cs). If found, increment the patch version "
            "(e.g. 1.2.3 → 1.2.4). For a significant new feature use a minor bump (1.2.3 → 1.3.0). "
            "If no version file exists, skip this step. Do not create a release tag.\n"
        )

    delivery_instructions = {
        "plan_only": (
            "DELIVERY\n"
            "You are in PLAN-ONLY mode. Analyse the repository and produce the implementation plan "
            "from Step 2, but do NOT make any file edits. Call finish() with the plan as your summary.\n"
        ),
        "pr_mode": (
            "DELIVERY\n"
            "You are in PR mode. After all changes are validated, the system will automatically "
            "create a branch, commit, push, and open a pull request. Your job is to complete all "
            "steps above and call finish() with a summary. Do not commit or push yourself.\n"
        ),
        "direct_commit": (
            "DELIVERY\n"
            "You are in DIRECT-COMMIT mode. After all changes are validated, the system will "
            "commit and push directly to the base branch. Your job is to complete all steps above "
            "and call finish() with a summary. Do not commit or push yourself.\n"
        ),
    }.get(delivery_mode, "")
    parts.append(delivery_instructions)

    parts.append(
        "FINISH\n"
        "Call finish() with a summary covering: the main changes made, validation results, "
        "version bump (if any), changelog entry (if any), and docs updates (if any). "
        "If no files changed, set the summary to clearly state that no changes were made.\n"
    )

    return "\n".join(parts)

CODING_SYSTEM_PROMPT = (
    "You are BaumAgent, an autonomous AI script and code generator.\n\n"

    "Your job is to write complete, production-ready scripts or code files based on the user's "
    "description. You are NOT working inside a GitHub repository — you write files directly to "
    "an output directory that the user can download.\n\n"

    "PROCESS\n"
    "1. Understand exactly what the user needs: the language, platform, inputs, outputs, and "
    "any edge cases.\n"
    "2. Use web_search and read_url if you need to look up APIs, syntax, or best practices.\n"
    "3. Write the complete, working script(s) using write_file. Include helpful comments.\n"
    "4. If the task warrants multiple files (e.g. a main script + a helper module + a config), "
    "write all of them.\n"
    "5. Call finish() with the filename of the primary output file and a summary of what was "
    "created and how to use it.\n\n"

    "WRITING STANDARDS\n"
    "- Write complete, runnable code — no placeholders, no TODO stubs.\n"
    "- Include inline comments explaining non-obvious logic.\n"
    "- Handle errors and edge cases gracefully.\n"
    "- For shell/PowerShell scripts, include usage instructions at the top as comments.\n"
    "- For Python scripts, include a main() function and if __name__ == '__main__' guard."
)

RESEARCH_SYSTEM_PROMPT = (
    "You are a research reporting agent. Your job is not to provide a brief answer, but to "
    "produce a fully developed written report.\n\n"

    "PROCESS\n"
    "When given a topic, follow this process:\n"
    "1. Internally create a structured outline with the major sections needed to cover the topic "
    "thoroughly.\n"
    "2. For each section, identify the specific questions that must be answered.\n"
    "3. Research and draft each section separately — run dedicated web searches per section, "
    "read full pages with read_url, not just search snippets.\n"
    "4. After all sections are researched, synthesize them into a final document with smooth "
    "transitions between sections.\n"
    "5. Before calling finish(), review the draft for thin sections, missing dimensions, or "
    "over-summarized content and expand where necessary.\n\n"

    "SECTION REQUIREMENTS\n"
    "Every major section must include:\n"
    "- A thorough explanation of the topic or subtopic\n"
    "- Important evidence, data, or findings\n"
    "- Practical implications for the reader\n"
    "- Limitations, risks, or counterarguments\n"
    "- Concrete examples where relevant\n\n"

    "WRITING REQUIREMENTS\n"
    "- Prefer completeness over brevity. Do not compress complex topics into one-liners.\n"
    "- Write in full paragraphs with substance. Avoid thin bullet lists.\n"
    "- Aim for a substantial, multi-section report unless the user explicitly asks for a summary.\n"
    "- Include an executive summary section at the top, but preserve full detail in the body.\n"
    "- Write like an analyst preparing a briefing document, not a chatbot answering a question.\n"
    "- Synthesize — do not merely restate facts. Highlight patterns, contradictions, and "
    "what matters most.\n\n"

    "OUTPUT FORMAT\n"
    "Call finish() with:\n"
    "- title: a descriptive report title (string)\n"
    "- sections: a list of {heading, content} objects where each content field is multiple "
    "full paragraphs of developed prose (not one-line summaries)\n"
    "- sources: list of URLs cited\n\n"

    "Do not call finish() until every planned section is fully drafted with multiple substantive "
    "paragraphs. A section with one or two sentences is not complete."
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

# Tools available for local coding / script-generation tasks
CODING_TOOL_DEFINITIONS: list[ToolDefinition] = [
    {
        "name": "write_file",
        "description": "Write a file to the output directory. Use this to create scripts, code files, configs, etc.",
        "parameters": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "Filename including extension, e.g. 'script.ps1' or 'utils/helper.py'.",
                },
                "content": {
                    "type": "string",
                    "description": "The complete file content.",
                },
            },
            "required": ["filename", "content"],
        },
    },
    {
        "name": "read_file",
        "description": "Read a file you previously wrote, to review or build on it.",
        "parameters": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "Filename to read (must have been written in this session).",
                }
            },
            "required": ["filename"],
        },
    },
    {
        "name": "web_search",
        "description": "Search the web using DuckDuckGo and return results.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query."}
            },
            "required": ["query"],
        },
    },
    {
        "name": "read_url",
        "description": "Fetch and read content from a URL.",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "The URL to fetch."}
            },
            "required": ["url"],
        },
    },
    {
        "name": "finish",
        "description": "Signal that all scripts are written and ready.",
        "parameters": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "Summary of what was created and how to use it.",
                },
                "main_file": {
                    "type": "string",
                    "description": "Filename of the primary output script/file.",
                },
            },
            "required": ["summary", "main_file"],
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
        self._output_dir: str = ""
        self._finished: bool = False
        self._research_result: dict | None = None
        self._coding_result: dict | None = None
        self._collected_image_urls: list[str] = []

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
            raw_html = resp.text

            # Extract image URLs before stripping HTML
            img_srcs = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', raw_html, re.IGNORECASE)
            for src in img_srcs:
                if src.startswith('data:'):
                    continue
                # Skip tiny icons / svgs
                if src.lower().endswith('.svg') or 'icon' in src.lower() or 'logo' in src.lower():
                    continue
                abs_url = urljoin(url, src)
                if abs_url not in self._collected_image_urls:
                    self._collected_image_urls.append(abs_url)
                if len(self._collected_image_urls) >= 10:
                    break

            # Strip HTML tags
            text = re.sub(r'<[^>]+>', '', raw_html)
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

    def _tool_coding_write_file(self, filename: str, content: str) -> str:
        # Sanitize path — no traversal outside output dir
        safe_name = os.path.normpath(filename).lstrip("/\\")
        full_path = os.path.join(self._output_dir, safe_name)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        try:
            with open(full_path, "w", encoding="utf-8") as fh:
                fh.write(content)
            size = len(content.encode("utf-8"))
            self._log(f"[write_file] {safe_name} ({size} bytes)")
            return f"Written: {safe_name}"
        except Exception as exc:
            return f"Error writing file: {exc}"

    def _tool_coding_read_file(self, filename: str) -> str:
        safe_name = os.path.normpath(filename).lstrip("/\\")
        full_path = os.path.join(self._output_dir, safe_name)
        if not os.path.isfile(full_path):
            return f"File not found: {safe_name}"
        try:
            with open(full_path, "r", encoding="utf-8", errors="replace") as fh:
                return fh.read(8000)
        except Exception as exc:
            return f"Error reading file: {exc}"

    def _tool_finish_coding(self, summary: str, main_file: str) -> str:
        self._finished = True
        self._coding_result = {"summary": summary, "main_file": main_file}
        self._log(f"[finish] Coding complete: {main_file}")
        return "Scripts ready."

    # ------------------------------------------------------------------
    # Tool dispatcher
    # ------------------------------------------------------------------

    async def tool_executor(self, name: str, args: dict) -> str:
        task_type = getattr(self._task, "task_type", "code")

        if name == "list_dir":
            return self._tool_list_dir(args.get("path", "."))
        elif name == "read_file":
            if task_type == "coding":
                return self._tool_coding_read_file(args["filename"])
            return self._tool_read_file(args["path"])
        elif name == "write_file":
            if task_type == "coding":
                return self._tool_coding_write_file(args["filename"], args["content"])
            return self._tool_write_file(args["path"], args["content"])
        elif name == "delete_file":
            return self._tool_delete_file(args["path"])
        elif name == "web_search":
            return self._tool_web_search(args["query"])
        elif name == "read_url":
            return self._tool_read_url(args["url"])
        elif name == "finish":
            if task_type == "research":
                return self._tool_finish_research(
                    title=args.get("title", "Research Report"),
                    sections=args.get("sections", []),
                    sources=args.get("sources", []),
                )
            elif task_type == "coding":
                return self._tool_finish_coding(
                    summary=args.get("summary", ""),
                    main_file=args.get("main_file", ""),
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
        elif task_type == "coding":
            await self._run_coding(task, db, llm_client)
        else:
            await self._run_code(task, db, settings, llm_client)

    async def _run_research(self, task, db, llm_client) -> None:
        """Run a research task: web search + document generation, no GitHub."""
        initial_message_text = (
            f"Research task: {task.description}\n\n"
            "Follow the full research process:\n"
            "1. Plan your sections and the questions each must answer.\n"
            "2. Research each section with dedicated searches — use read_url to read full pages, "
            "not just search snippets.\n"
            "3. Draft each section with multiple full paragraphs covering: explanation, evidence, "
            "implications, risks/counterarguments, and examples.\n"
            "4. Review for thin or over-summarized sections and expand them.\n"
            "5. Only then call finish() with the complete structured report.\n\n"
            "Do not call finish() early. A section is not complete if it contains only one or "
            "two sentences."
        )
        initial_content = self._build_initial_message(initial_message_text)

        self._finished = False
        self._research_result = None
        self._collected_image_urls = []

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
                    image_urls=self._collected_image_urls if _fmt.get("include_images") else [],
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

    async def _run_coding(self, task, db, llm_client) -> None:
        """Run a local coding/script task: generate files, no GitHub."""
        output_dir = f"/app/data/outputs/{task.id}"
        os.makedirs(output_dir, exist_ok=True)
        self._output_dir = output_dir

        self._finished = False
        self._coding_result = None

        initial_message = (
            f"Coding task: {task.description}\n\n"
            "Write complete, production-ready scripts. Use write_file to create each file. "
            "Search the web if you need to look up syntax, APIs, or best practices. "
            "When all files are written, call finish() with the primary filename and a usage summary."
        )

        await llm_client.run_agent_loop(
            system=CODING_SYSTEM_PROMPT,
            initial_message=self._build_initial_message(initial_message),
            tools=CODING_TOOL_DEFINITIONS,
            tool_executor=self.tool_executor,
            log_fn=self._log,
        )

        if self._coding_result:
            main_file = self._coding_result.get("main_file", "")
            full_path = os.path.join(output_dir, os.path.normpath(main_file).lstrip("/\\"))
            if os.path.isfile(full_path):
                task.output_file = full_path
                self._log(f"Primary output: {full_path}")
            else:
                # Pick first file in output dir as fallback
                files = [f for f in os.listdir(output_dir) if os.path.isfile(os.path.join(output_dir, f))]
                if files:
                    task.output_file = os.path.join(output_dir, sorted(files)[0])
                    self._log(f"Primary output (fallback): {task.output_file}")
        else:
            self._log("WARNING: LLM did not call finish() — checking output dir for files")
            files = [f for f in os.listdir(output_dir) if os.path.isfile(os.path.join(output_dir, f))]
            if files:
                task.output_file = os.path.join(output_dir, sorted(files)[0])

        task.status = TaskStatus.COMPLETE
        task.updated_at = datetime.now(timezone.utc)
        db.commit()
        self._log("Done.")

    async def _run_code(self, task, db, settings, llm_client) -> None:
        """Run a code task: clone repo, apply changes, deliver per delivery_mode."""
        opts: dict = json.loads(task.extra_data or "{}")
        delivery_mode = opts.get("delivery_mode", "pr_mode")

        github_service = GitHubService(
            token=settings.github_token,
            user_name=settings.github_user_name,
            user_email=settings.github_user_email,
        )
        self._log(f"Cloning {task.repo_url} (branch: {task.base_branch}) ...")
        self._repo_path = github_service.clone(task.id, task.repo_url, task.base_branch)
        self._log(f"Cloned to {self._repo_path}")

        try:
            self._finished = False
            initial_message_text = (
                f"Task: {task.description}\n"
                f"Repo: {task.repo_url}\n\n"
                "Start by listing the repository structure."
            )
            initial_content = self._build_initial_message(initial_message_text)

            system_prompt = _build_code_system_prompt(opts)
            await llm_client.run_agent_loop(
                system=system_prompt,
                initial_message=initial_content,
                tools=CODE_TOOL_DEFINITIONS,
                tool_executor=self.tool_executor,
                log_fn=self._log,
            )

            # Check for actual changes
            from git import Repo as GitRepo
            repo = GitRepo(self._repo_path)
            has_changes = repo.is_dirty(untracked_files=True)

            if delivery_mode == "plan_only":
                # No repo mutations — just mark complete
                task.status = TaskStatus.COMPLETE
                task.updated_at = datetime.now(timezone.utc)
                db.commit()
                self._log("Plan-only mode: no changes committed.")
                return

            if not has_changes:
                raise RuntimeError(
                    "Agent completed without making any file changes. "
                    "No commit or PR will be created. Check the task log for details."
                )

            commit_message = f"baumagent: {task.description[:72]}\n\nTask-ID: {task.id}"

            if delivery_mode == "direct_commit":
                self._log("Committing and pushing directly to base branch ...")
                commit_sha = github_service.commit_all(self._repo_path, commit_message)
                self._log(f"Committed: {commit_sha}")
                github_service.push(self._repo_path, task.base_branch)
                self._log("Pushed to base branch.")

                task.status = TaskStatus.COMPLETE
                task.commit_sha = commit_sha
                task.updated_at = datetime.now(timezone.utc)
                db.commit()
                self._log("Done.")

            else:  # pr_mode (default)
                branch_name = f"baumagent/{task.id[:8]}"
                self._log(f"Creating branch {branch_name} ...")
                github_service.create_branch(self._repo_path, branch_name)

                self._log("Committing changes ...")
                commit_sha = github_service.commit_all(self._repo_path, commit_message)
                self._log(f"Committed: {commit_sha}")

                self._log("Pushing branch ...")
                github_service.push(self._repo_path, branch_name)

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

                task.status = TaskStatus.COMPLETE
                task.branch_name = branch_name
                task.pr_url = pr_url
                task.pr_number = pr_number
                task.commit_sha = commit_sha
                task.updated_at = datetime.now(timezone.utc)
                db.commit()
                self._log("Done.")

        finally:
            github_service.cleanup(self._repo_path)
