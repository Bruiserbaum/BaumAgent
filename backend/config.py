from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:////app/data/baumAgent.db"
    redis_url: str = "redis://redis:6379/0"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    github_token: str = ""
    github_user_name: str = "BaumAgent"
    github_user_email: str = "baumagent@localhost"
    ollama_base_url: str = "http://ollama:11434"
    default_llm_backend: str = "anthropic"
    default_llm_model: str = "claude-opus-4-6"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
