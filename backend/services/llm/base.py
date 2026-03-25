from typing import Protocol, Any, TypedDict, Union


class ToolDefinition(TypedDict):
    name: str
    description: str
    parameters: dict  # JSON Schema


# initial_message can be a plain string or a list of content dicts
# (e.g. [{"type": "text", "text": "..."}, {"type": "image", "data": "...", "media_type": "image/png"}])
InitialMessage = Union[str, list[dict]]


class LLMClient(Protocol):
    async def run_agent_loop(
        self,
        system: str,
        initial_message: InitialMessage,
        tools: list[ToolDefinition],
        tool_executor: Any,  # callable: async (name: str, args: dict) -> str
        log_fn: Any,         # callable: (str) -> None
    ) -> str:
        ...
