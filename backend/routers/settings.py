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
    }


def _write_settings_file(data: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
    with open(SETTINGS_FILE, "w") as fh:
        json.dump(data, fh, indent=2)


class PortalSettings(BaseModel):
    default_llm_backend: str
    default_llm_model: str


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
    return PortalSettings(**data)


@router.put("/api/settings", response_model=PortalSettings)
def update_settings(payload: PortalSettings) -> PortalSettings:
    existing = _read_settings_file()
    existing.update(payload.model_dump())
    _write_settings_file(existing)
    return PortalSettings(**existing)
