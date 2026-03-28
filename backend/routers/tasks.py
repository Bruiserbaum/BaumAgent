import json
import os
from typing import Annotated, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status, Form, UploadFile, File
from fastapi.responses import FileResponse
from redis import Redis
from rq import Queue
from sqlalchemy.orm import Session

from config import get_settings
from database import get_db
from dependencies import get_current_user
from models.task import Task, TaskCreate, TaskRead, TaskStatus
from worker.job import run_task

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _get_redis_queue() -> Queue:
    settings = get_settings()
    redis = Redis.from_url(settings.redis_url)
    return Queue("baumagent", connection=redis)


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(
    description: str = Form(...),
    repo_url: str = Form(""),
    base_branch: str = Form("main"),
    llm_backend: str = Form("anthropic"),
    llm_model: str = Form("claude-opus-4-6"),
    task_type: str = Form("code"),
    output_format: str | None = Form(None),
    project_id: Optional[str] = Form(None),
    images: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> Task:
    task_id = str(uuid4())

    # Save uploaded images
    image_paths: list[str] = []
    for i, img in enumerate(images):
        if img.filename:
            ext = img.filename.rsplit('.', 1)[-1].lower() if '.' in img.filename else 'png'
            upload_dir = f"/app/data/uploads/{task_id}"
            os.makedirs(upload_dir, exist_ok=True)
            rel_path = f"uploads/{task_id}/image_{i}.{ext}"
            with open(f"/app/data/{rel_path}", "wb") as f:
                f.write(await img.read())
            image_paths.append(rel_path)

    task = Task(
        id=task_id,
        description=description,
        repo_url=repo_url,
        base_branch=base_branch,
        llm_backend=llm_backend,
        llm_model=llm_model,
        task_type=task_type,
        output_format=output_format,
        images=json.dumps(image_paths),
        status=TaskStatus.QUEUED,
        log="",
        user_id=current_user.id,
        project_id=project_id if project_id else None,
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
def list_tasks(
    db: Annotated[Session, Depends(get_db)],
    current_user=Depends(get_current_user),
) -> list[Task]:
    return (
        db.query(Task)
        .filter(Task.user_id == current_user.id)
        .order_by(Task.created_at.desc())
        .all()
    )


@router.get("/{task_id}", response_model=TaskRead)
def get_task(
    task_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user=Depends(get_current_user),
) -> Task:
    task = db.query(Task).filter(Task.id == task_id).first()
    if task is None or task.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/{task_id}/retry", response_model=TaskRead)
def retry_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> Task:
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status not in (TaskStatus.FAILED, TaskStatus.COMPLETE):
        raise HTTPException(status_code=409, detail="Only failed or completed tasks can be re-run")
    task.status = TaskStatus.QUEUED
    task.error_message = None
    task.rq_job_id = None
    task.output_file = None
    db.commit()
    db.refresh(task)
    queue = _get_redis_queue()
    job = queue.enqueue(run_task, task.id, job_timeout=3600)
    task.rq_job_id = job.id
    db.commit()
    db.refresh(task)
    return task


@router.post("/{task_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
def cancel_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> None:
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status not in (TaskStatus.QUEUED, TaskStatus.RUNNING):
        raise HTTPException(status_code=409, detail="Only queued or running tasks can be cancelled")

    # Best-effort: cancel the RQ job
    if task.rq_job_id:
        try:
            from rq.job import Job
            redis = Redis.from_url(get_settings().redis_url)
            job = Job.fetch(task.rq_job_id, connection=redis)
            job.cancel()
        except Exception:
            pass

    task.status = TaskStatus.FAILED
    task.error_message = "Cancelled by user"
    db.commit()


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user=Depends(get_current_user),
) -> None:
    task = db.query(Task).filter(Task.id == task_id).first()
    if task is None or task.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status == TaskStatus.RUNNING:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete a running task — cancel it first.",
        )
    db.delete(task)
    db.commit()


@router.get("/{task_id}/download")
async def download_task_output(
    task_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task or task.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Task not found")

    # Try stored path first
    if task.output_file and os.path.exists(task.output_file):
        return FileResponse(task.output_file, filename=os.path.basename(task.output_file))

    # Filesystem fallback: scan the output directory for any generated file
    output_dir = f"/app/data/outputs/{task_id}"
    if os.path.isdir(output_dir):
        files = sorted(
            f for f in os.listdir(output_dir)
            if os.path.isfile(os.path.join(output_dir, f))
        )
        if files:
            found_path = os.path.join(output_dir, files[0])
            task.output_file = found_path
            db.commit()
            return FileResponse(found_path, filename=files[0])

    # Build a diagnostic message so the user (and logs) can see exactly what happened
    if task.output_file:
        detail = (
            f"Output file path is recorded ({task.output_file}) but the file does not exist. "
            f"Output directory ({output_dir}) "
            + ("exists but is empty." if os.path.isdir(output_dir) else "does not exist.")
        )
    else:
        detail = (
            "No output file path recorded for this task. "
            f"Output directory ({output_dir}) "
            + ("exists but is empty — document generation likely failed (check task log)."
               if os.path.isdir(output_dir)
               else "does not exist — document was never generated (check task log).")
        )
    raise HTTPException(status_code=404, detail=detail)


@router.get("/{task_id}/output-text")
async def get_task_output_text(
    task_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return the raw text content of a coding task's output file (for copy-to-clipboard)."""
    from fastapi.responses import PlainTextResponse
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task or task.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Task not found")
    if not task.output_file or not os.path.isfile(task.output_file):
        raise HTTPException(status_code=404, detail="No output file for this task")
    with open(task.output_file, "r", encoding="utf-8", errors="replace") as fh:
        content = fh.read()
    return PlainTextResponse(content)


@router.put("/{task_id}/project", response_model=TaskRead)
def assign_project(
    task_id: str,
    body: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Assign or unassign a task to a project. Body: {"project_id": "uuid-or-null"}"""
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == current_user.id).first()
    if not task:
        raise HTTPException(404, "Task not found")
    project_id = body.get("project_id")
    if project_id:
        from models.project import Project
        proj = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
        if not proj:
            raise HTTPException(404, "Project not found")
    task.project_id = project_id
    db.commit()
    db.refresh(task)
    return TaskRead.model_validate(task)
