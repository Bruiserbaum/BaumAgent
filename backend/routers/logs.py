"""
WebSocket endpoint for live task log streaming.

Message protocol (JSON frames):
  {"type": "log",      "data": "<new log text>"}
  {"type": "status",   "data": "running"|"complete"|"failed"|"cancelled"}
  {"type": "progress", "data": 0-100}
  {"type": "done",     "data": {"status": "...", "output_file": "..." | null, "error": "..." | null}}

The "done" frame is the terminal message — clients should close the WebSocket after receiving it.
"""
import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from database import SessionLocal
from models.task import Task, TaskStatus

router = APIRouter(tags=["logs"])

TERMINAL_STATUSES = {TaskStatus.COMPLETE, TaskStatus.FAILED, TaskStatus.CANCELLED}


def _frame(type_: str, data) -> str:
    return json.dumps({"type": type_, "data": data})


@router.websocket("/ws/tasks/{task_id}/logs")
async def task_logs(websocket: WebSocket, task_id: str) -> None:
    await websocket.accept()
    db: Session = SessionLocal()
    try:
        sent_chars = 0
        last_status: str | None = None
        last_progress: int | None = None

        while True:
            task: Task | None = db.query(Task).filter(Task.id == task_id).first()
            if task is None:
                await websocket.send_text(_frame("error", "Task not found."))
                break

            # Stream new log characters
            current_log = task.log or ""
            if len(current_log) > sent_chars:
                new_text = current_log[sent_chars:]
                await websocket.send_text(_frame("log", new_text))
                sent_chars = len(current_log)

            # Emit status change
            if task.status != last_status:
                await websocket.send_text(_frame("status", task.status))
                last_status = task.status

            # Emit progress change
            if task.progress_percent is not None and task.progress_percent != last_progress:
                await websocket.send_text(_frame("progress", task.progress_percent))
                last_progress = task.progress_percent

            if task.status in TERMINAL_STATUSES:
                await websocket.send_text(_frame("done", {
                    "status": task.status,
                    "output_file": task.output_file,
                    "pr_url": task.pr_url,
                    "error": task.error_message,
                }))
                break

            db.expire_all()
            await asyncio.sleep(0.5)

    except WebSocketDisconnect:
        pass
    finally:
        db.close()
