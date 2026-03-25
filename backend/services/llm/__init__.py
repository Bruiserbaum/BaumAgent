from services.llm.base import LLMClient, ToolDefinition
from services.llm.anthropic_client import AnthropicClient
from services.llm.openai_client import OpenAIClient
from services.llm.ollama_client import OllamaClient


def get_llm_client(backend: str, model: str, settings) -> LLMClient:
    if backend == "anthropic":
        return AnthropicClient(api_key=settings.anthropic_api_key, model=model)
    elif backend == "openai":
        return OpenAIClient(api_key=settings.openai_api_key, model=model)
    elif backend == "ollama":
        return OllamaClient(model=model, base_url=settings.ollama_base_url)
    raise ValueError(f"Unknown backend: {backend}")


__all__ = ["get_llm_client", "LLMClient", "ToolDefinition", "AnthropicClient", "OpenAIClient", "OllamaClient"]
