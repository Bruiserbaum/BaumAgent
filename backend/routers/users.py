from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models.user import UserRead, UserUpdate
from dependencies import get_current_user

router = APIRouter(tags=["users"])


@router.get("/api/me", response_model=UserRead)
def get_me(current_user=Depends(get_current_user)):
    return current_user


@router.put("/api/me", response_model=UserRead)
def update_me(
    payload: UserUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.display_name is not None:
        name = payload.display_name.strip()
        if name:
            current_user.display_name = name
    if payload.avatar_url is not None:
        # Allow clearing the avatar by sending an empty string
        current_user.avatar_url = payload.avatar_url.strip() or None
    db.commit()
    db.refresh(current_user)
    return current_user
