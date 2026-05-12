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

    # Claude Code (headless CLI) settings
    claude_code_max_turns: int = 50

    # When true, GET /api/tasks returns all users' tasks (shared queue view).
    team_mode: bool = False

    # Pairing code TTL in seconds (shown as QR on the web UI).
    pair_code_ttl: int = 300

    # --- Push notifications ---
    # APNs (Mac): token-based auth
    apns_key_id: str = ""       # 10-char key ID from Apple Developer portal
    apns_team_id: str = ""      # 10-char team ID
    apns_bundle_id: str = ""    # e.g. com.bruiserbaum.baumagent
    apns_key_pem: str = ""      # contents of the .p8 private key (newlines as \n)
    apns_production: bool = False

    # FCM (Android): legacy server key
    fcm_server_key: str = ""

    # WNS (Windows): Azure app registration
    wns_package_sid: str = ""
    wns_client_secret: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
