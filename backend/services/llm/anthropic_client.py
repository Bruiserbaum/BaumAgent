from typing import Any, Union
import anthropic

from services.llm.base import ToolDefinition, InitialMessage


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
    ) -> str:
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

        while True:
            response = await self._client.messages.create(
                model=self._model,
                max_tokens=8192,
                system=system,
                tools=anthropic_tools,
                messages=messages,
            )

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

            if not tool_use_blocks or response.stop_reason == "end_turn" and not tool_use_blocks:
                break

            if not tool_use_blocks:
                # end_turn with no tools — we're done
                break

            # Execute all tool calls and collect results
            tool_results = []
            for block in tool_use_blocks:
                log_fn(f"[tool] {block.name}({block.input})")
                try:
                    result = await tool_executor(block.name, block.input)
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

            # If stop_reason is end_turn after tool execution we continue the loop
            if response.stop_reason == "end_turn" and not tool_use_blocks:
                break

        return final_text
