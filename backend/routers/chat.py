import base64
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import get_settings
from dependencies import get_current_user

router = APIRouter(tags=["chat"])


class ChatMessage(BaseModel):
    role: str    # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    backend: str = "anthropic"
    model: str = "claude-opus-4-6"
    images: list[str] = []   # base64 data URLs attached to the last user message


def _parse_data_url(data_url: str) -> tuple[str, str]:
    """Extract media_type and raw base64 from a data: URL."""
    m = re.match(r'data:([^;]+);base64,(.+)', data_url)
    if not m:
        raise ValueError("Invalid data URL")
    return m.group(1), m.group(2)


def _build_anthropic_messages(messages: list[ChatMessage], images: list[str]) -> list[dict]:
    """Build Anthropic message list, embedding images into the last user message."""
    msgs = []
    for i, m in enumerate(messages):
        is_last = i == len(messages) - 1
        if is_last and m.role == "user" and images:
            content: list[dict] = []
            for data_url in images:
                try:
                    media_type, b64_data = _parse_data_url(data_url)
                    content.append({
                        "type": "image",
                        "source": {"type": "base64", "media_type": media_type, "data": b64_data},
                    })
                except Exception:
                    pass
            content.append({"type": "text", "text": m.content})
            msgs.append({"role": "user", "content": content})
        else:
            msgs.append({"role": m.role, "content": m.content})
    return msgs


def _build_openai_messages(messages: list[ChatMessage], images: list[str]) -> list[dict]:
    """Build OpenAI message list, embedding images into the last user message."""
    msgs = []
    for i, m in enumerate(messages):
        is_last = i == len(messages) - 1
        if is_last and m.role == "user" and images:
            content: list[dict] = [{"type": "text", "text": m.content}]
            for data_url in images:
                content.append({"type": "image_url", "image_url": {"url": data_url}})
            msgs.append({"role": "user", "content": content})
        else:
            msgs.append({"role": m.role, "content": m.content})
    return msgs


class ChatResponse(BaseModel):
    message: str


@router.post("/api/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    _current_user=Depends(get_current_user),
) -> ChatResponse:
    cfg = get_settings()

    if payload.backend == "anthropic":
        import anthropic
        if not cfg.anthropic_api_key:
            raise HTTPException(400, "Anthropic API key not configured")
        client = anthropic.AsyncAnthropic(api_key=cfg.anthropic_api_key)
        msgs = _build_anthropic_messages(payload.messages, payload.images)
        response = await client.messages.create(
            model=payload.model,
            max_tokens=4096,
            messages=msgs,
        )
        return ChatResponse(message=response.content[0].text)

    else:
        import openai as _openai
        if payload.backend == "ollama":
            base_url = f"{cfg.ollama_base_url}/v1"
            api_key = "ollama"
        else:
            base_url = None
            api_key = cfg.openai_api_key
            if not api_key:
                raise HTTPException(400, "OpenAI API key not configured")
        client = _openai.AsyncOpenAI(api_key=api_key, base_url=base_url)
        msgs = _build_openai_messages(payload.messages, payload.images)
        response = await client.chat.completions.create(
            model=payload.model,
            messages=msgs,
            max_tokens=4096,
        )
        return ChatResponse(message=response.choices[0].message.content or "")
