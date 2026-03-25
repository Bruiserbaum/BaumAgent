import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from database import SessionLocal
from models.task import Task, TaskStatus

router = APIRouter(tags=["logs"])

TERMINAL_STATUSES = {TaskStatus.COMPLETE, TaskStatus.FAILED}


@router.websocket("/ws/tasks/{task_id}/logs")
async def task_logs(websocket: WebSocket, task_id: str) -> None:
    await websocket.accept()
    db: Session = SessionLocal()
    try:
        sent_chars = 0

        while True:
            task: Task | None = db.query(Task).filter(Task.id == task_id).first()
            if task is None:
                await websocket.send_text("[error] Task not found.\n")
                break

            current_log = task.log or ""
            if len(current_log) > sent_chars:
                new_content = current_log[sent_chars:]
                await websocket.send_text(new_content)
                sent_chars = len(current_log)

            if task.status in TERMINAL_STATUSES:
                break

            # Expire identity map so next query reflects DB changes
            db.expire_all()
            await asyncio.sleep(0.5)

    except WebSocketDisconnect:
        pass
    finally:
        db.close()
