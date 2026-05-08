"""FastAPI dependencies shared across routers."""
from datetime import datetime, timezone

from fastapi import Request, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models.user import User

DEV_EMAIL = "local@localhost"


def _authentik_name(request: Request) -> str:
    return (
        request.headers.get("X-Authentik-Name")
        or request.headers.get("X-authentik-name")
        or ""
    ).strip()


def _resolve_via_token(raw_header: str, db: Session) -> User | None:
    """Look up a user by a Bearer API token. Returns None if invalid/expired."""
    if not raw_header.startswith("Bearer "):
        return None
    token = raw_header[len("Bearer "):]
    if not token.startswith("bat_"):
        return None

    from models.api_token import ApiToken
    token_hash = ApiToken.hash(token)
    record = db.query(ApiToken).filter(ApiToken.token_hash == token_hash).first()
    if not record:
        return None
    if record.expires_at and record.expires_at < datetime.now(timezone.utc):
        return None

    # Stamp last_used_at without disturbing the caller's transaction
    record.last_used_at = datetime.now(timezone.utc)
    db.commit()

    user = db.query(User).filter(User.id == record.user_id).first()
    return user


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """
    Resolve the current user. Priority order:
      1. Authorization: Bearer bat_<token>  — native client API token
      2. X-Auth-Request-Email / X-Forwarded-Email / X-Auth-Request-User — Authentik headers
      3. DEV_EMAIL fallback for local dev (no auth headers present)
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header:
        user = _resolve_via_token(auth_header, db)
        if user:
            return user
        # Header present but invalid — reject rather than falling through to dev mode
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired API token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Authentik / SSO path
    email = (
        request.headers.get("X-Auth-Request-Email")
        or request.headers.get("X-Forwarded-Email")
        or request.headers.get("X-Auth-Request-User")
        or DEV_EMAIL
    )
    email = email.strip().lower()
    authentik_display = _authentik_name(request)

    user = db.query(User).filter(User.email == email).first()
    if not user:
        display_name = authentik_display or email.split("@")[0].replace(".", " ").title()
        user = User(email=email, display_name=display_name)
        db.add(user)
        db.commit()
        db.refresh(user)
    elif authentik_display and user.display_name != authentik_display:
        user.display_name = authentik_display
        db.commit()
    return user
