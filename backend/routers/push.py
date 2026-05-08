"""Push token registration for native clients."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models.push_token import PushToken, PushTokenRead, PushTokenRegister
from models.user import User

router = APIRouter(prefix="/api/push", tags=["push"])


@router.post("/register", response_model=PushTokenRead, status_code=status.HTTP_201_CREATED)
def register_push_token(
    body: PushTokenRegister,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Register (or refresh) a push token for the authenticated device.
    If the same token already exists for this user, updates the device label.
    """
    existing = db.query(PushToken).filter(
        PushToken.user_id == current_user.id,
        PushToken.token == body.token,
    ).first()

    if existing:
        existing.device_label = body.device_label
        existing.platform = body.platform
        db.commit()
        db.refresh(existing)
        return existing

    record = PushToken(
        user_id=current_user.id,
        platform=body.platform,
        token=body.token,
        device_label=body.device_label,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/tokens", response_model=list[PushTokenRead])
def list_push_tokens(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(PushToken).filter(PushToken.user_id == current_user.id).all()


@router.delete("/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_push_token(
    token_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(PushToken).filter(
        PushToken.id == token_id,
        PushToken.user_id == current_user.id,
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Token not found.")
    db.delete(record)
    db.commit()
