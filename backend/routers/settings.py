import json
import os
from typing import Any

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from config import get_settings

router = APIRouter(tags=["settings"])

SETTINGS_FILE = "/app/data/settings.json"

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


def _read_settings_file() -> dict[str, Any]:
    if os.path.isfile(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r") as fh:
                return json.load(fh)
        except Exception:
            pass
    cfg = get_settings()
    return {
        "default_llm_backend": cfg.default_llm_backend,
        "default_llm_model": cfg.default_llm_model,
        "doc_format": DocFormatSettings().model_dump(),
    }


def _write_settings_file(data: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
    with open(SETTINGS_FILE, "w") as fh:
        json.dump(data, fh, indent=2)


def get_doc_format() -> dict:
    """Returns the current doc_format settings as a plain dict."""
    data = _read_settings_file()
    defaults = DocFormatSettings()
    stored = data.get("doc_format", {})
    merged = {**defaults.model_dump(), **stored}
    return merged


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
# Portal settings
# ---------------------------------------------------------------------------


@router.get("/api/settings", response_model=PortalSettings)
def read_settings() -> PortalSettings:
    data = _read_settings_file()
    # Fill in doc_format defaults if missing from file
    defaults = DocFormatSettings()
    stored_fmt = data.get("doc_format", {})
    merged_fmt = {**defaults.model_dump(), **stored_fmt}
    data["doc_format"] = merged_fmt
    return PortalSettings(**data)


@router.put("/api/settings", response_model=PortalSettings)
def update_settings(payload: PortalSettings) -> PortalSettings:
    existing = _read_settings_file()
    payload_dict = payload.model_dump()
    # Merge doc_format separately to preserve any keys not in payload
    existing_fmt = existing.get("doc_format", {})
    new_fmt = payload_dict.get("doc_format", {})
    existing_fmt.update(new_fmt)
    existing.update(payload_dict)
    existing["doc_format"] = existing_fmt
    _write_settings_file(existing)
    # Fill defaults for response
    defaults = DocFormatSettings()
    merged_fmt = {**defaults.model_dump(), **existing.get("doc_format", {})}
    existing["doc_format"] = merged_fmt
    return PortalSettings(**existing)
