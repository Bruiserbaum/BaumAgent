from typing import Any
import json
import openai

from services.llm.base import ToolDefinition


class OpenAIClient:
    def __init__(self, api_key: str, model: str, base_url: str | None = None) -> None:
        self._client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._model = model

    async def run_agent_loop(
        self,
        system: str,
        initial_message: str,
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

        messages: list[dict] = [
            {"role": "system", "content": system},
            {"role": "user", "content": initial_message},
        ]
        final_text = ""

        while True:
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=messages,
                tools=openai_tools,
            )

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
