from fastapi import APIRouter, Depends
from redis import Redis
from rq import Queue
from rq.registry import StartedJobRegistry
from sqlalchemy.orm import Session

from config import get_settings
from database import get_db
from dependencies import get_current_user
from models.task import Task

router = APIRouter(tags=["queue"])


@router.get("/api/queue")
def get_queue_status(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return the global RQ queue state as ordered lists of task IDs."""
    cfg = get_settings()
    redis = Redis.from_url(cfg.redis_url)
    q = Queue("baumagent", connection=redis)
    registry = StartedJobRegistry(q.name, connection=redis)

    queued_job_ids: list[str] = [job.id for job in q.jobs]
    running_job_ids: list[str] = registry.get_job_ids()

    all_job_ids = queued_job_ids + running_job_ids
    if not all_job_ids:
        return {"queued": [], "running": []}

    tasks_by_job: dict[str, str] = {
        t.rq_job_id: t.id
        for t in db.query(Task).filter(Task.rq_job_id.in_(all_job_ids)).all()
        if t.rq_job_id
    }

    return {
        "queued":  [tasks_by_job[jid] for jid in queued_job_ids  if jid in tasks_by_job],
        "running": [tasks_by_job[jid] for jid in running_job_ids if jid in tasks_by_job],
    }
