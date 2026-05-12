"""
Claude Code headless-mode LLM client for BaumAgent.

Runs the ``claude`` CLI in non-interactive (``-p`` / ``--print``) mode as a
subprocess inside the target repository.  Claude Code manages its own tool
execution (file edits, shell commands, etc.) so BaumAgent's built-in tool
definitions are **not** forwarded — instead the entire coding task is delegated
to Claude Code.

Requirements:
  - Node.js ≥ 18 and ``@anthropic-ai/claude-code`` installed globally
    (``npm i -g @anthropic-ai/claude-code``)
  - ``ANTHROPIC_API_KEY`` set in the environment (the worker container
    already receives this from docker-compose)

Claude Code flags used:
  --print / -p              non-interactive single-prompt mode
  --output-format stream-json   real-time JSON streaming to stdout
  --dangerously-skip-permissions  unattended — no permission prompts
  --max-turns N             limit agentic turns (default 50)
  --model MODEL             override model (e.g. sonnet, opus)
"""

import asyncio
import json
import os
import shutil
from typing import Any

from services.llm.base import ToolDefinition, InitialMessage


# Map BaumAgent model IDs to Claude Code --model values.
# Claude Code accepts short aliases; we keep both short and full names.
CLAUDE_CODE_MODEL_MAP: dict[str, str] = {
    "claude-code-sonnet-4":  "sonnet",
    "claude-code-opus-4":    "opus",
    "claude-code-haiku-4":   "haiku",
    "claude-code-sonnet":    "sonnet",
    "claude-code-opus":      "opus",
    "claude-code-haiku":     "haiku",
}


def _resolve_model_flag(model_id: str) -> str:
    """Return the ``--model`` value for the Claude CLI."""
    return CLAUDE_CODE_MODEL_MAP.get(model_id, model_id)


def _find_claude_binary() -> str:
    """Locate the ``claude`` CLI binary.  Returns the path or raises."""
    claude = shutil.which("claude")
    if claude:
        return claude
    # Common global npm install locations inside Docker
    for candidate in [
        "/usr/local/bin/claude",
        "/usr/bin/claude",
        os.path.expanduser("~/.npm-global/bin/claude"),
    ]:
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    raise FileNotFoundError(
        "Claude Code CLI ('claude') not found on PATH.  "
        "Install it with: npm install -g @anthropic-ai/claude-code"
    )


class ClaudeCodeClient:
    """LLM client that delegates coding tasks to the Claude Code CLI."""

    def __init__(
        self,
        api_key: str,
        model: str = "claude-code-sonnet-4",
        max_turns: int = 50,
        working_dir: str | None = None,
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._max_turns = max_turns
        # working_dir is set later by the agent service (repo clone path)
        self._working_dir = working_dir

    # Allow the agent service to override the working directory after init
    def set_working_dir(self, path: str) -> None:
        self._working_dir = path

    # ------------------------------------------------------------------
    # LLMClient protocol
    # ------------------------------------------------------------------

    async def run_agent_loop(
        self,
        system: str,
        initial_message: InitialMessage,
        tools: list[ToolDefinition],
        tool_executor: Any,
        log_fn: Any,
        max_rounds: int = 50,
    ) -> str:
        """Run Claude Code in headless mode and stream output back.

        ``tools`` and ``tool_executor`` are provided for protocol
        compatibility but Claude Code manages its own tool execution.
        We only call ``tool_executor("finish", ...)`` at the end to
        signal completion to the BaumAgent framework.
        """
        claude_bin = _find_claude_binary()
        model_flag = _resolve_model_flag(self._model)

        # Build the combined prompt — Claude Code receives a single prompt
        # string in -p mode; we prepend the system instructions.
        if isinstance(initial_message, str):
            user_text = initial_message
        else:
            # Extract text parts from content-block list
            user_text = "\n".join(
                item.get("text", "") for item in initial_message if item.get("type") == "text"
            )

        prompt = f"{system}\n\n---\n\nTask:\n{user_text}"

        cmd = [
            claude_bin,
            "--print",
            "--output-format", "stream-json",
            "--dangerously-skip-permissions",
            "--model", model_flag,
            "--max-turns", str(self._max_turns),
            "--verbose",
        ]

        env = {**os.environ}
        if self._api_key:
            env["ANTHROPIC_API_KEY"] = self._api_key

        cwd = self._working_dir or os.getcwd()
        log_fn(f"[claude-code] Starting Claude Code ({model_flag}) in {cwd}")
        log_fn(f"[claude-code] Command: {' '.join(cmd[:6])}…")

        final_result = ""
        cost_usd = 0.0
        duration_ms = 0

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd,
                env=env,
            )

            # Feed the prompt via stdin and close
            if proc.stdin:
                proc.stdin.write(prompt.encode("utf-8"))
                await proc.stdin.drain()
                proc.stdin.close()

            # Stream stdout line by line (stream-json = one JSON object per line)
            assert proc.stdout is not None
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                text = line.decode("utf-8", errors="replace").strip()
                if not text:
                    continue

                try:
                    event = json.loads(text)
                except json.JSONDecodeError:
                    # Plain text line — log it directly
                    log_fn(f"[claude-code] {text}")
                    continue

                event_type = event.get("type", "")

                # ── Handle different stream-json event types ──
                if event_type == "assistant":
                    # Assistant message (text or tool_use)
                    content = event.get("message", {}).get("content", [])
                    for block in content:
                        if block.get("type") == "text":
                            snippet = block["text"][:500]
                            log_fn(f"[claude-code] {snippet}")
                        elif block.get("type") == "tool_use":
                            tool_name = block.get("name", "?")
                            log_fn(f"[claude-code] 🔧 {tool_name}")

                elif event_type == "result":
                    # Final result object
                    final_result = event.get("result", "")
                    cost_usd = event.get("total_cost_usd", 0)
                    duration_ms = event.get("duration_ms", 0)
                    is_error = event.get("is_error", False)
                    subtype = event.get("subtype", "")
                    session_id = event.get("session_id", "")

                    if is_error:
                        log_fn(f"[claude-code] ❌ Error: {final_result[:500]}")
                    else:
                        log_fn(f"[claude-code] ✅ Completed ({subtype})")

                    if cost_usd:
                        log_fn(f"[claude-code] 💰 Cost: ${cost_usd:.4f}")
                    if duration_ms:
                        log_fn(f"[claude-code] ⏱️  Duration: {duration_ms / 1000:.1f}s")
                    if session_id:
                        log_fn(f"[claude-code] 🔑 Session: {session_id}")

                elif event_type == "system":
                    msg = event.get("message", "")
                    if msg:
                        log_fn(f"[claude-code] ℹ️  {msg[:300]}")

                else:
                    # Unknown event type — log a summary
                    log_fn(f"[claude-code] [{event_type}] {str(event)[:200]}")

            # Wait for the process to finish
            await proc.wait()

            # Capture stderr for diagnostics
            stderr_bytes = await proc.stderr.read() if proc.stderr else b""
            stderr_text = stderr_bytes.decode("utf-8", errors="replace").strip()
            if stderr_text:
                # Only log meaningful stderr (skip Node.js deprecation warnings etc.)
                for err_line in stderr_text.splitlines()[-10:]:
                    if err_line.strip():
                        log_fn(f"[claude-code:stderr] {err_line.strip()}")

            if proc.returncode != 0 and not final_result:
                final_result = f"Claude Code exited with code {proc.returncode}. {stderr_text[:500]}"
                log_fn(f"[claude-code] ❌ Non-zero exit code: {proc.returncode}")

        except FileNotFoundError as exc:
            log_fn(f"[claude-code] ❌ {exc}")
            final_result = str(exc)
        except Exception as exc:
            log_fn(f"[claude-code] ❌ Unexpected error: {exc}")
            final_result = f"Claude Code error: {exc}"

        # Signal completion to the BaumAgent framework via the finish tool
        has_finish = any(t["name"] == "finish" for t in tools)
        if has_finish:
            summary = final_result or "Claude Code completed without producing a result."
            try:
                await tool_executor("finish", {"summary": summary})
            except Exception:
                pass  # finish() may raise StopIteration or similar — safe to ignore

        return final_result
