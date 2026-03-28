import asyncio
from typing import Any, Union
import anthropic

from services.llm.base import ToolDefinition, InitialMessage

# Nudge injected when the LLM responds with no tool call but finish() hasn't been called yet
_NUDGE = (
    "You responded with text but did not call any tool. "
    "If you are done with your research, please call finish() now with your complete structured results. "
    "If you still need to gather information, call the appropriate tool."
)

# Nudge when the response was cut off by the token limit
_MAX_TOKENS_NUDGE = (
    "Your previous response was cut off because it hit the token limit. "
    "Please call the finish() tool now with the research you have gathered so far."
)


class AnthropicClient:
    def __init__(self, api_key: str, model: str) -> None:
        self._client = anthropic.AsyncAnthropic(api_key=api_key)
        self._model = model

    def _build_content(self, initial_message: InitialMessage) -> list[dict]:
        """Convert initial_message (str or content-block list) to Anthropic content blocks."""
        if isinstance(initial_message, str):
            return [{"type": "text", "text": initial_message}]

        blocks: list[dict] = []
        for item in initial_message:
            if item.get("type") == "text":
                blocks.append({"type": "text", "text": item["text"]})
            elif item.get("type") == "image":
                blocks.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": item["media_type"],
                        "data": item["data"],
                    },
                })
        return blocks

    async def run_agent_loop(
        self,
        system: str,
        initial_message: InitialMessage,
        tools: list[ToolDefinition],
        tool_executor: Any,
        log_fn: Any,
        max_rounds: int = 50,
    ) -> str:
        has_finish_tool = any(t["name"] == "finish" for t in tools)

        anthropic_tools = [
            {
                "name": t["name"],
                "description": t["description"],
                "input_schema": t["parameters"],
            }
            for t in tools
        ]

        content = self._build_content(initial_message)
        messages: list[dict] = [{"role": "user", "content": content}]
        final_text = ""
        finish_called = False
        nudge_count = 0

        for round_num in range(max_rounds):
            # Retry on 429 rate-limit with exponential backoff (up to 4 attempts)
            for attempt in range(4):
                try:
                    response = await self._client.messages.create(
                        model=self._model,
                        max_tokens=16000,
                        system=system,
                        tools=anthropic_tools,
                        messages=messages,
                    )
                    break
                except anthropic.RateLimitError as exc:
                    if attempt == 3:
                        raise
                    wait = 15 * (2 ** attempt)  # 15s, 30s, 60s
                    log_fn(f"[agent] Rate limited (429) — retrying in {wait}s (attempt {attempt + 1}/4)")
                    await asyncio.sleep(wait)

            stop_reason = response.stop_reason

            # Collect text and tool_use blocks
            tool_use_blocks = []
            text_parts = []
            for block in response.content:
                if block.type == "text":
                    text_parts.append(block.text)
                elif block.type == "tool_use":
                    tool_use_blocks.append(block)

            if text_parts:
                final_text = " ".join(text_parts)

            # Append assistant message
            messages.append({"role": "assistant", "content": response.content})

            # Handle max_tokens: LLM was cut off — nudge it to call finish()
            if stop_reason == "max_tokens" and has_finish_tool and not finish_called:
                log_fn(f"[agent] Response hit max_tokens on round {round_num + 1} — nudging finish()")
                messages.append({"role": "user", "content": [{"type": "text", "text": _MAX_TOKENS_NUDGE}]})
                nudge_count += 1
                continue

            # No tool calls at all
            if not tool_use_blocks:
                # If there's a finish tool and it hasn't been called yet, nudge once
                if has_finish_tool and not finish_called and nudge_count < 3:
                    log_fn(f"[agent] No tool call on round {round_num + 1} — nudging finish() (nudge {nudge_count + 1})")
                    messages.append({"role": "user", "content": [{"type": "text", "text": _NUDGE}]})
                    nudge_count += 1
                    continue
                break

            # Execute all tool calls
            tool_results = []
            for block in tool_use_blocks:
                log_fn(f"[tool] {block.name}({block.input})")
                try:
                    result = await tool_executor(block.name, block.input)
                    if block.name == "finish":
                        finish_called = True
                except Exception as exc:
                    result = f"Error: {exc}"
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    }
                )

            messages.append({"role": "user", "content": tool_results})

            # If finish() was called, one more assistant turn then stop
            if finish_called:
                break

        if round_num + 1 >= max_rounds:
            log_fn(f"[agent] Max rounds ({max_rounds}) reached")

        return final_text
