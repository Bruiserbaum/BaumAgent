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


class ChatResponse(BaseModel):
    message: str


@router.post("/api/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    _current_user=Depends(get_current_user),
) -> ChatResponse:
    cfg = get_settings()
    msgs = [{"role": m.role, "content": m.content} for m in payload.messages]

    if payload.backend == "anthropic":
        import anthropic
        if not cfg.anthropic_api_key:
            raise HTTPException(400, "Anthropic API key not configured")
        client = anthropic.AsyncAnthropic(api_key=cfg.anthropic_api_key)
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
        response = await client.chat.completions.create(
            model=payload.model,
            messages=msgs,
            max_tokens=4096,
        )
        return ChatResponse(message=response.choices[0].message.content or "")
