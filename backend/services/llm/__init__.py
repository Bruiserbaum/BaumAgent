from services.llm.base import LLMClient, ToolDefinition
from services.llm.anthropic_client import AnthropicClient
from services.llm.openai_client import OpenAIClient
from services.llm.ollama_client import OllamaClient
from services.llm.claude_code_client import ClaudeCodeClient


def get_llm_client(backend: str, model: str, settings) -> LLMClient:
    if backend == "anthropic":
        return AnthropicClient(api_key=settings.anthropic_api_key, model=model)
    elif backend == "openai":
        return OpenAIClient(api_key=settings.openai_api_key, model=model)
    elif backend == "ollama":
        return OllamaClient(model=model, base_url=settings.ollama_base_url)
    elif backend == "claude_code":
        return ClaudeCodeClient(
            api_key=settings.anthropic_api_key,
            model=model,
            max_turns=settings.claude_code_max_turns,
        )
    raise ValueError(f"Unknown backend: {backend}")


__all__ = [
    "get_llm_client",
    "LLMClient",
    "ToolDefinition",
    "AnthropicClient",
    "OpenAIClient",
    "OllamaClient",
    "ClaudeCodeClient",
]
