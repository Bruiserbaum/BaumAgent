from typing import Any, Union
import asyncio
import json
import openai

from services.llm.base import ToolDefinition, InitialMessage


class OpenAIClient:
    def __init__(self, api_key: str, model: str, base_url: str | None = None) -> None:
        self._client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._model = model

    def _build_content(self, initial_message: InitialMessage) -> str | list[dict]:
        """Convert initial_message to OpenAI content format."""
        if isinstance(initial_message, str):
            return initial_message

        blocks: list[dict] = []
        for item in initial_message:
            if item.get("type") == "text":
                blocks.append({"type": "text", "text": item["text"]})
            elif item.get("type") == "image":
                data_uri = f"data:{item['media_type']};base64,{item['data']}"
                blocks.append({
                    "type": "image_url",
                    "image_url": {"url": data_uri},
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
        openai_tools = [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": t["parameters"],
                },
            }
            for t in tools
        ]

        content = self._build_content(initial_message)
        messages: list[dict] = [
            {"role": "system", "content": system},
            {"role": "user", "content": content},
        ]
        final_text = ""

        while True:
            for _attempt in range(6):
                try:
                    response = await self._client.chat.completions.create(
                        model=self._model,
                        messages=messages,
                        tools=openai_tools,
                    )
                    break
                except openai.RateLimitError:
                    if _attempt == 5:
                        raise
                    wait = min(60, 5 * (2 ** _attempt))
                    log_fn(f"[rate_limit] TPM limit hit — waiting {wait}s before retry {_attempt + 1}/5…")
                    await asyncio.sleep(wait)

            choice = response.choices[0]
            message = choice.message
            messages.append(message.model_dump(exclude_unset=False))

            if message.content:
                final_text = message.content

            tool_calls = message.tool_calls or []

            if choice.finish_reason == "stop" and not tool_calls:
                break

            if not tool_calls:
                break

            for tc in tool_calls:
                args = json.loads(tc.function.arguments or "{}")
                log_fn(f"[tool] {tc.function.name}({args})")
                try:
                    result = await tool_executor(tc.function.name, args)
                except Exception as exc:
                    result = f"Error: {exc}"
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result,
                    }
                )

        return final_text
