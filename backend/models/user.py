from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import Column, String, Text, DateTime
from pydantic import BaseModel, ConfigDict
from typing import Optional
from database import Base

def _utcnow(): return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"
    id          = Column(String, primary_key=True, default=lambda: str(uuid4()))
    email       = Column(String, unique=True, nullable=False, index=True)
    display_name = Column(String, nullable=False)
    created_at  = Column(DateTime, default=_utcnow, nullable=False)
    settings    = Column(Text, default="{}", nullable=False)  # JSON blob for per-user settings

class UserRead(BaseModel):
    id: str
    email: str
    display_name: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
