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
        # Dispatch push notifications for terminal states (fire-and-forget).
        if task is not None and task.status in (TaskStatus.COMPLETE, TaskStatus.FAILED):
            try:
                _dispatch_push(task, db, settings)
            except Exception:
                pass  # never let push failure affect the job result
        db.close()


def _dispatch_push(task, db, settings) -> None:
    from models.push_token import PushToken
    from services.push_service import dispatch, PushPayload

    tokens = db.query(PushToken).filter(PushToken.user_id == task.user_id).all()
    if not tokens:
        return

    title = "Task complete" if task.status == "complete" else "Task failed"
    desc = (task.description or "")[:80]
    body = desc if task.status == "complete" else f"{desc} — {task.error_message or 'error'}"
    payload = PushPayload(title=title, body=body, task_id=task.id)

    async def _send_all():
        import asyncio
        await asyncio.gather(
            *(dispatch(t.token, t.platform, payload, settings) for t in tokens),
            return_exceptions=True,
        )

    asyncio.run(_send_all())
