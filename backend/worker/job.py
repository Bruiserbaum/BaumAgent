import asyncio
from datetime import datetime, timezone


def run_task(task_id: str) -> None:
    """RQ job — runs synchronously in the worker process."""
    from database import SessionLocal, init_db
    from models.task import Task, TaskStatus
    from services.agent_service import AgentService
    from config import get_settings

    init_db()
    settings = get_settings()
    db = SessionLocal()
    task = None
    try:
        task = db.query(Task).filter(Task.id == task_id).first()
        if task is None:
            raise ValueError(f"Task {task_id} not found in database.")
        agent = AgentService(task=task, db=db, settings=settings)
        asyncio.run(agent.run())
    except Exception as exc:
        if task is not None:
            task.status = TaskStatus.FAILED
            task.error_message = str(exc)
            task.updated_at = datetime.now(timezone.utc)
            db.commit()
        raise
    finally:
        db.close()
