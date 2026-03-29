import json
from typing import Any

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config import get_settings
from database import get_db
from dependencies import get_current_user
from models.user import User

router = APIRouter(tags=["settings"])

ANTHROPIC_MODELS = [
    # Claude 4 series
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
    # Claude 3.7 series
    "claude-3-7-sonnet-20250219",
    # Claude 3.5 series
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    # Claude 3 series
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-3-haiku-20240307",
]

# Fallback used when the OpenAI key is absent or the models endpoint fails
OPENAI_MODELS_FALLBACK = [
    "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano",
    "gpt-4o", "gpt-4o-mini",
    "o3", "o3-mini", "o4-mini",
    "o1", "o1-mini",
]

# Prefixes that identify chat-capable models worth showing in the UI
_OPENAI_CHAT_PREFIXES = ("gpt-", "o1", "o2", "o3", "o4", "o5", "chatgpt-")


class DocFormatSettings(BaseModel):
    title_font_size: int = 24          # 12–40
    heading_font_size: int = 14        # 10–28
    body_font_size: int = 11           # 8–18
    header_color: str = "#2c3e50"      # hex color for section headings
    accent_color: str = "#3498db"      # hex color for dividers / title underline
    include_summary: bool = True       # prepend an auto-generated bullets summary section
    include_links: bool = True         # include Sources section at end
    include_images: bool = False       # reserved for future use (no-op for now)
    section_style: str = "paragraphs"  # "paragraphs" | "bullets" | "mixed"
    page_size: str = "letter"          # "letter" | "a4"
    summary_as_bullets: bool = True    # summary section uses bullet list


DEFAULT_DOC_FORMAT = {
    "title_font_size": 24,
    "heading_font_size": 14,
    "body_font_size": 11,
    "header_color": "#2c3e50",
    "accent_color": "#3498db",
    "include_summary": True,
    "include_links": True,
    "include_images": False,
    "section_style": "paragraphs",
    "page_size": "letter",
    "summary_as_bullets": True,
}


def _get_user_settings(user: User) -> dict:
    try:
        stored = json.loads(user.settings or "{}")
    except Exception:
        stored = {}
    cfg = get_settings()
    defaults: dict[str, Any] = {
        "default_llm_backend": cfg.default_llm_backend,
        "default_llm_model": cfg.default_llm_model,
        "doc_format": DEFAULT_DOC_FORMAT,
    }
    result = {**defaults, **stored}
    result["doc_format"] = {**DEFAULT_DOC_FORMAT, **stored.get("doc_format", {})}
    return result


def _save_user_settings(user: User, data: dict, db: Session) -> None:
    user.settings = json.dumps(data)
    db.commit()


def get_doc_format(user_settings: dict | None = None) -> dict:
    """Returns the current doc_format settings as a plain dict.

    When called without a user_settings dict (e.g. from the worker process),
    it falls back to the schema defaults.
    """
    if user_settings is None:
        return {**DocFormatSettings().model_dump()}
    return {**DocFormatSettings().model_dump(), **user_settings.get("doc_format", {})}


class SMBSettings(BaseModel):
    enabled: bool = False
    host: str = ""
    share: str = ""
    username: str = ""
    password: str = ""
    domain: str = ""
    remote_path: str = ""


class PortalSettings(BaseModel):
    default_llm_backend: str
    default_llm_model: str
    chat_backend: str = ""
    chat_model: str = ""
    research_backend: str = ""
    research_model: str = ""
    code_backend: str = ""
    code_model: str = ""
    coding_backend: str = ""
    coding_model: str = ""
    doc_format: DocFormatSettings = DocFormatSettings()
    smb: SMBSettings = SMBSettings()


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@router.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


@router.get("/api/models")
async def get_models() -> dict[str, list[str]]:
    cfg = get_settings()

    # Fetch Ollama models
    ollama_models: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(f"{cfg.ollama_base_url}/api/tags")
            if resp.status_code == 200:
                ollama_models = [m["name"] for m in resp.json().get("models", [])]
    except Exception:
        pass

    # Fetch OpenAI models live; fall back to static list on any failure
    openai_models: list[str] = []
    if cfg.openai_api_key:
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {cfg.openai_api_key}"},
                )
                if resp.status_code == 200:
                    data = resp.json().get("data", [])
                    # Only keep first-party OpenAI chat models
                    openai_models = sorted(
                        m["id"] for m in data
                        if m.get("owned_by") in ("openai", "openai-internal", "system")
                        and m["id"].startswith(_OPENAI_CHAT_PREFIXES)
                        and not any(x in m["id"] for x in (
                            "-realtime-", "-audio-", "-embedding",
                            "-search-", "-instruct", "-deep-research",
                            "-transcribe", "-tts",
                        ))
                    )
        except Exception:
            pass

    if not openai_models:
        openai_models = OPENAI_MODELS_FALLBACK

    return {
        "anthropic": ANTHROPIC_MODELS,
        "openai": openai_models,
        "ollama": ollama_models,
    }


# ---------------------------------------------------------------------------
# Portal settings (per-user, stored in User.settings JSON column)
# ---------------------------------------------------------------------------


@router.get("/api/settings", response_model=PortalSettings)
def read_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PortalSettings:
    data = _get_user_settings(current_user)
    defaults = DocFormatSettings()
    stored_fmt = data.get("doc_format", {})
    merged_fmt = {**defaults.model_dump(), **stored_fmt}
    data["doc_format"] = merged_fmt
    return PortalSettings(**data)


@router.post("/api/settings/smb/test")
def test_smb(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    data = _get_user_settings(current_user)
    smb_cfg = data.get("smb", {})
    try:
        from services.smb_service import test_smb_connection
        msg = test_smb_connection(smb_cfg)
        return {"ok": True, "message": msg}
    except Exception as exc:
        return {"ok": False, "message": str(exc)}


@router.put("/api/settings", response_model=PortalSettings)
def update_settings(
    payload: PortalSettings,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PortalSettings:
    existing = _get_user_settings(current_user)
    payload_dict = payload.model_dump()
    # Merge doc_format separately to preserve any keys not in payload
    existing_fmt = existing.get("doc_format", {})
    new_fmt = payload_dict.get("doc_format", {})
    existing_fmt.update(new_fmt)
    existing.update(payload_dict)
    existing["doc_format"] = existing_fmt
    _save_user_settings(current_user, existing, db)
    # Fill defaults for response
    defaults = DocFormatSettings()
    merged_fmt = {**defaults.model_dump(), **existing.get("doc_format", {})}
    existing["doc_format"] = merged_fmt
    return PortalSettings(**existing)
