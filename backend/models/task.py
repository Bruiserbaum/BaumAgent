import enum
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Column, String, Text, DateTime, Integer
from pydantic import BaseModel, ConfigDict
from typing import Optional

from database import Base


class TaskStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETE = "complete"
    FAILED = "failed"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)
    description = Column(Text, nullable=False)
    repo_url = Column(String, nullable=False)
    base_branch = Column(String, default="main", nullable=False)
    llm_backend = Column(String, default="anthropic", nullable=False)
    llm_model = Column(String, default="claude-opus-4-6", nullable=False)
    status = Column(String, default=TaskStatus.QUEUED, nullable=False)
    rq_job_id = Column(String, nullable=True)
    branch_name = Column(String, nullable=True)
    pr_url = Column(String, nullable=True)
    pr_number = Column(Integer, nullable=True)
    commit_sha = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)
    log = Column(Text, default="", nullable=False)
    task_type = Column(String, default="code", nullable=False)
    images = Column(Text, default="[]", nullable=False)
    output_file = Column(String, nullable=True)
    output_format = Column(String, nullable=True)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class TaskCreate(BaseModel):
    description: str
    repo_url: str
    base_branch: str = "main"
    llm_backend: str = "anthropic"
    llm_model: str = "claude-opus-4-6"
    task_type: str = "code"
    output_format: str | None = None


class TaskRead(BaseModel):
    id: str
    created_at: datetime
    updated_at: datetime
    description: str
    repo_url: str
    base_branch: str
    llm_backend: str
    llm_model: str
    status: str
    rq_job_id: Optional[str] = None
    branch_name: Optional[str] = None
    pr_url: Optional[str] = None
    pr_number: Optional[int] = None
    commit_sha: Optional[str] = None
    error_message: Optional[str] = None
    log: str
    task_type: str
    output_file: Optional[str] = None
    output_format: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
