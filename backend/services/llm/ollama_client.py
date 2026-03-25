from services.llm.openai_client import OpenAIClient


class OllamaClient(OpenAIClient):
    """
    LLM client for Ollama using its OpenAI-compatible API endpoint.

    Note: Tool/function calling support depends on the specific model loaded in Ollama.
    Models such as mistral-nemo, llama3.1, qwen2.5 support tool calls; others may not.
    """

    def __init__(self, model: str, base_url: str = "http://ollama:11434") -> None:
        super().__init__(
            api_key="ollama",
            model=model,
            base_url=f"{base_url}/v1",
        )
