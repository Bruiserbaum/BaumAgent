from typing import Protocol, Any, TypedDict


class ToolDefinition(TypedDict):
    name: str
    description: str
    parameters: dict  # JSON Schema


class LLMClient(Protocol):
    async def run_agent_loop(
        self,
        system: str,
        initial_message: str,
        tools: list[ToolDefinition],
        tool_executor: Any,  # callable: async (name: str, args: dict) -> str
        log_fn: Any,         # callable: (str) -> None
    ) -> str:
        ...
