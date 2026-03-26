from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import Column, String, DateTime, Integer
from pydantic import BaseModel, ConfigDict
from typing import Optional
from database import Base

def _utcnow(): return datetime.now(timezone.utc)

class Project(Base):
    __tablename__ = "projects"
    id         = Column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id    = Column(String, nullable=False, index=True)
    name       = Column(String, nullable=False)
    color      = Column(String, nullable=False, default="#3b82f6")
    position   = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=_utcnow, nullable=False)

class ProjectCreate(BaseModel):
    name: str
    color: str = "#3b82f6"

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    position: Optional[int] = None

class ProjectRead(BaseModel):
    id: str
    user_id: str
    name: str
    color: str
    position: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
