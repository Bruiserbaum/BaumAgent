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

ANTHROPIC_MODELS = ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"]
OPENAI_MODELS = ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini"]


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


class PortalSettings(BaseModel):
    default_llm_backend: str
    default_llm_model: str
    doc_format: DocFormatSettings = DocFormatSettings()


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
    ollama_models: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(f"{cfg.ollama_base_url}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                ollama_models = [m["name"] for m in data.get("models", [])]
    except Exception:
        pass

    return {
        "anthropic": ANTHROPIC_MODELS,
        "openai": OPENAI_MODELS,
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
