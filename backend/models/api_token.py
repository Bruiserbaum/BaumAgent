import hashlib
import secrets
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Column, String, DateTime
from pydantic import BaseModel, ConfigDict
from typing import Optional

from database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ApiToken(Base):
    __tablename__ = "api_tokens"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    token_hash = Column(String, nullable=False, unique=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    last_used_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)

    @staticmethod
    def generate() -> str:
        return "bat_" + secrets.token_hex(32)

    @staticmethod
    def hash(token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()


class ApiTokenRead(BaseModel):
    id: str
    name: str
    created_at: datetime
    last_used_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class PairInitiateResponse(BaseModel):
    code: str
    expires_in: int
    pair_url: str


class PairCompleteRequest(BaseModel):
    code: str
    device_name: str


class PairCompleteResponse(BaseModel):
    token: str
    token_id: str
    user_id: str
    user_email: str
    user_display_name: str
