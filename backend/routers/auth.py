"""
Native client authentication — QR pairing flow and API token management.

Flow:
  1. Authenticated web-UI user calls POST /api/auth/pair/initiate.
     Server stores {user_id} in Redis under key pair:<code> with a TTL.
     Returns the code + a baumagent:// deep-link the web UI encodes as a QR.

  2. Native client scans QR (or user pastes code), then calls
     POST /api/auth/pair/complete with {code, device_name}.
     Server exchanges code for a long-lived API token and returns it once.

  3. Client stores the token in platform-native secure storage and sends
     Authorization: Bearer bat_<token> on every subsequent request.

  4. Tokens can be revoked from the web UI via DELETE /api/auth/tokens/{id}.
"""
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from redis import Redis
from sqlalchemy.orm import Session

from config import get_settings
from database import get_db
from dependencies import get_current_user
from models.api_token import ApiToken, ApiTokenRead, PairCompleteRequest, PairCompleteResponse, PairInitiateResponse
from models.user import User

router = APIRouter(prefix="/api/auth", tags=["auth"])

_PAIR_KEY_PREFIX = "pair:"


def _redis() -> Redis:
    return Redis.from_url(get_settings().redis_url)


# ---------------------------------------------------------------------------
# Pairing — initiation (requires existing Authentik/SSO session in web UI)
# ---------------------------------------------------------------------------

@router.post("/pair/initiate", response_model=PairInitiateResponse)
def initiate_pair(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a one-time pairing code. Call this from the web UI (logged-in user).
    The code encodes as a QR; the native client scans it to pair.
    """
    settings = get_settings()
    code = secrets.token_urlsafe(16)
    ttl = settings.pair_code_ttl

    r = _redis()
    r.setex(f"{_PAIR_KEY_PREFIX}{code}", ttl, current_user.id)

    # Derive the external base URL from the incoming request so the deep-link
    # points at the same host the client already knows about.
    base = str(request.base_url).rstrip("/")
    pair_url = f"baumagent://pair?url={base}&code={code}"

    return PairInitiateResponse(code=code, expires_in=ttl, pair_url=pair_url)


# ---------------------------------------------------------------------------
# Pairing — completion (unauthenticated; code IS the credential)
# ---------------------------------------------------------------------------

@router.post("/pair/complete", response_model=PairCompleteResponse, status_code=status.HTTP_201_CREATED)
def complete_pair(
    body: PairCompleteRequest,
    db: Session = Depends(get_db),
):
    """Exchange a pairing code for a long-lived API token. Code is consumed on first use."""
    r = _redis()
    key = f"{_PAIR_KEY_PREFIX}{body.code}"
    user_id_bytes = r.get(key)
    if not user_id_bytes:
        raise HTTPException(status_code=400, detail="Pairing code is invalid or has expired.")

    # Consume immediately — single use
    r.delete(key)

    user_id = user_id_bytes.decode()
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    raw_token = ApiToken.generate()
    record = ApiToken(
        user_id=user.id,
        name=body.device_name or "Unnamed device",
        token_hash=ApiToken.hash(raw_token),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return PairCompleteResponse(
        token=raw_token,
        token_id=record.id,
        user_id=user.id,
        user_email=user.email,
        user_display_name=user.display_name,
    )


# ---------------------------------------------------------------------------
# Token management (web UI — lists and revokes tokens for the current user)
# ---------------------------------------------------------------------------

@router.get("/tokens", response_model=list[ApiTokenRead])
def list_tokens(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(ApiToken).filter(ApiToken.user_id == current_user.id).all()


@router.delete("/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_token(
    token_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(ApiToken).filter(
        ApiToken.id == token_id,
        ApiToken.user_id == current_user.id,
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Token not found.")
    db.delete(record)
    db.commit()
