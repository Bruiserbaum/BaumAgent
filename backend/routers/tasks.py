from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from redis import Redis
from rq import Queue
from sqlalchemy.orm import Session

from config import get_settings
from database import get_db
from models.task import Task, TaskCreate, TaskRead, TaskStatus
from worker.job import run_task

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _get_redis_queue() -> Queue:
    settings = get_settings()
    redis = Redis.from_url(settings.redis_url)
    return Queue("baumagent", connection=redis)


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    db: Annotated[Session, Depends(get_db)],
) -> Task:
    task = Task(
        id=str(uuid4()),
        description=payload.description,
        repo_url=payload.repo_url,
        base_branch=payload.base_branch,
        llm_backend=payload.llm_backend,
        llm_model=payload.llm_model,
        status=TaskStatus.QUEUED,
        log="",
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    queue = _get_redis_queue()
    job = queue.enqueue(run_task, task.id, job_timeout=3600)
    task.rq_job_id = job.id
    db.commit()
    db.refresh(task)
    return task


@router.get("", response_model=list[TaskRead])
def list_tasks(db: Annotated[Session, Depends(get_db)]) -> list[Task]:
    return db.query(Task).order_by(Task.created_at.desc()).all()


@router.get("/{task_id}", response_model=TaskRead)
def get_task(task_id: str, db: Annotated[Session, Depends(get_db)]) -> Task:
    task = db.query(Task).filter(Task.id == task_id).first()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: str, db: Annotated[Session, Depends(get_db)]) -> None:
    task = db.query(Task).filter(Task.id == task_id).first()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status not in (TaskStatus.QUEUED, TaskStatus.FAILED):
        raise HTTPException(
            status_code=409,
            detail="Only queued or failed tasks can be deleted.",
        )
    db.delete(task)
    db.commit()
