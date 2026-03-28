import re

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel

from config import get_settings
from dependencies import get_current_user
from services.document_service import extract_text, SUPPORTED_EXTENSIONS

router = APIRouter(tags=["chat"])


class ChatMessage(BaseModel):
    role: str    # "user" | "assistant"
    content: str


class DocumentAttachment(BaseModel):
    filename: str
    content: str   # extracted text content of the document


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    backend: str = "anthropic"
    model: str = "claude-opus-4-6"
    images: list[str] = []   # base64 data URLs attached to the last user message
    documents: list[DocumentAttachment] = []  # document text attached to the last user message


def _parse_data_url(data_url: str) -> tuple[str, str]:
    """Extract media_type and raw base64 from a data: URL."""
    m = re.match(r'data:([^;]+);base64,(.+)', data_url)
    if not m:
        raise ValueError("Invalid data URL")
    return m.group(1), m.group(2)


def _inject_documents(text: str, documents: list[DocumentAttachment]) -> str:
    """Prepend document contents to the user message text."""
    if not documents:
        return text
    parts = []
    for doc in documents:
        parts.append(f"[Attached file: {doc.filename}]\n{doc.content}\n[End of {doc.filename}]")
    doc_block = "\n\n".join(parts)
    if text.strip():
        return f"{doc_block}\n\n{text}"
    return doc_block


def _build_anthropic_messages(
    messages: list[ChatMessage],
    images: list[str],
    documents: list[DocumentAttachment],
) -> list[dict]:
    """Build Anthropic message list, embedding images and documents into the last user message."""
    msgs = []
    for i, m in enumerate(messages):
        is_last = i == len(messages) - 1
        msg_content = m.content
        if is_last and m.role == "user":
            msg_content = _inject_documents(msg_content, documents)
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
            content.append({"type": "text", "text": msg_content})
            msgs.append({"role": "user", "content": content})
        else:
            msgs.append({"role": m.role, "content": msg_content})
    return msgs


def _build_openai_messages(
    messages: list[ChatMessage],
    images: list[str],
    documents: list[DocumentAttachment],
) -> list[dict]:
    """Build OpenAI message list, embedding images and documents into the last user message."""
    msgs = []
    for i, m in enumerate(messages):
        is_last = i == len(messages) - 1
        msg_content = m.content
        if is_last and m.role == "user":
            msg_content = _inject_documents(msg_content, documents)
        if is_last and m.role == "user" and images:
            content: list[dict] = [{"type": "text", "text": msg_content}]
            for data_url in images:
                content.append({"type": "image_url", "image_url": {"url": data_url}})
            msgs.append({"role": "user", "content": content})
        else:
            msgs.append({"role": m.role, "content": msg_content})
    return msgs


class ChatResponse(BaseModel):
    message: str


class DocumentUploadResponse(BaseModel):
    filename: str
    content: str
    char_count: int


@router.post("/api/chat/upload-document", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    _current_user=Depends(get_current_user),
) -> DocumentUploadResponse:
    """Upload a document and extract its text content for use in chat."""
    if not file.filename:
        raise HTTPException(400, "No filename provided")

    # Validate extension
    ext_idx = file.filename.rfind(".")
    ext = file.filename[ext_idx:].lower() if ext_idx != -1 else ""
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            400,
            f"Unsupported file type: {ext}. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    # Read file data (limit to 50MB)
    data = await file.read()
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 50MB)")

    try:
        text = extract_text(file.filename, data)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Failed to extract text: {e}")

    return DocumentUploadResponse(
        filename=file.filename,
        content=text,
        char_count=len(text),
    )


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
        msgs = _build_anthropic_messages(payload.messages, payload.images, payload.documents)
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
        msgs = _build_openai_messages(payload.messages, payload.images, payload.documents)
        response = await client.chat.completions.create(
            model=payload.model,
            messages=msgs,
            max_tokens=4096,
        )
        return ChatResponse(message=response.choices[0].message.content or "")
