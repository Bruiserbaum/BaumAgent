from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models.user import UserRead
from dependencies import get_current_user

router = APIRouter(tags=["users"])

@router.get("/api/me", response_model=UserRead)
def get_me(current_user=Depends(get_current_user)):
    return current_user
