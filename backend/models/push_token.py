from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Column, String, DateTime
from pydantic import BaseModel, ConfigDict
from typing import Literal

from database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


Platform = Literal["apns", "fcm", "wns"]


class PushToken(Base):
    __tablename__ = "push_tokens"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String, nullable=False, index=True)
    platform = Column(String, nullable=False)  # apns | fcm | wns
    token = Column(String, nullable=False)
    device_label = Column(String, nullable=False, default="")
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)


class PushTokenRegister(BaseModel):
    platform: Platform
    token: str
    device_label: str = ""


class PushTokenRead(BaseModel):
    id: str
    platform: str
    device_label: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
