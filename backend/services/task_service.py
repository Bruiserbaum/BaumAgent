import os
from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from models.task import Task, TaskCreate, TaskRead
from models.user import User
from models.project import Project
from database import get_db


def create_task(db: Session, task_create: TaskCreate, user_id: str = None, project_id: str = None) -> Task:
    db_task = Task(
        id=str(uuid4()),
        description=task_create.description,
        repo_url=task_create.repo_url,
        base_branch=task_create.base_branch,
        llm_backend=task_create.llm_backend,
        llm_model=task_create.llm_model,
        task_type=task_create.task_type,
        user_id=user_id,
        project_id=project_id,
        output_file=task_create.output_file if hasattr(task_create, 'output_file') else None,
        output_format=task_create.output_format if hasattr(task_create, 'output_format') else None,
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task


def get_task(db: Session, task_id: str) -> Optional[Task]:
    return db.query(Task).filter(Task.id == task_id).first()


def update_task_status(db: Session, task_id: str, status: str) -> Optional[Task]:
    task = get_task(db, task_id)
    if task:
        task.status = status
        task.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(task)
    return task


def update_task_output(db: Session, task_id: str, output_file: str) -> Optional[Task]:
    task = get_task(db, task_id)
    if task:
        task.output_file = output_file
        task.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(task)
    return task


def update_task_error(db: Session, task_id: str, error_message: str) -> Optional[Task]:
    task = get_task(db, task_id)
    if task:
        task.error_message = error_message
        task.status = "failed"
        task.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(task)
    return task


def update_task_log(db: Session, task_id: str, log_entry: str) -> Optional[Task]:
    task = get_task(db, task_id)
    if task:
        task.log += log_entry + "\n"
        task.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(task)
    return task


def get_user_tasks(db: Session, user_id: str) -> list[Task]:
    return db.query(Task).filter(Task.user_id == user_id).order_by(Task.created_at.desc()).all()


def get_project_tasks(db: Session, project_id: str) -> list[Task]:
    return db.query(Task).filter(Task.project_id == project_id).order_by(Task.created_at.desc()).all()


def get_all_tasks(db: Session) -> list[Task]:
    return db.query(Task).order_by(Task.created_at.desc()).all()


def delete_task(db: Session, task_id: str) -> bool:
    task = get_task(db, task_id)
    if task:
        db.delete(task)
        db.commit()
        return True
    return False