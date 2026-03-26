"""FastAPI dependencies shared across routers."""
import json
from fastapi import Request, Depends
from sqlalchemy.orm import Session
from database import get_db
from models.user import User

DEV_EMAIL = "local@localhost"

def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """
    Resolves the current user from Authentik forward-auth headers.
    Header precedence: X-Auth-Request-Email, X-Forwarded-Email, X-Auth-Request-User.
    Falls back to DEV_EMAIL when no header is present (local dev without Authentik).
    Auto-creates the user on first login.
    """
    email = (
        request.headers.get("X-Auth-Request-Email")
        or request.headers.get("X-Forwarded-Email")
        or request.headers.get("X-Auth-Request-User")
        or DEV_EMAIL
    )
    email = email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        display_name = email.split("@")[0].replace(".", " ").title()
        user = User(email=email, display_name=display_name)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user
