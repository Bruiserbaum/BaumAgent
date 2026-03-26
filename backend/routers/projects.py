from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from dependencies import get_current_user
from models.project import Project, ProjectCreate, ProjectUpdate, ProjectRead
from models.task import Task

router = APIRouter(tags=["projects"])


@router.get("/api/projects", response_model=list[ProjectRead])
def list_projects(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[Project]:
    return (
        db.query(Project)
        .filter(Project.user_id == current_user.id)
        .order_by(Project.position)
        .all()
    )


@router.post("/api/projects", response_model=ProjectRead, status_code=201)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> Project:
    max_pos = (
        db.query(func.max(Project.position))
        .filter(Project.user_id == current_user.id)
        .scalar()
    )
    next_pos = (max_pos or 0) + 1
    project = Project(
        user_id=current_user.id,
        name=payload.name,
        color=payload.color,
        position=next_pos,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.put("/api/projects/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: str,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> Project:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == current_user.id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if payload.name is not None:
        project.name = payload.name
    if payload.color is not None:
        project.color = payload.color
    if payload.position is not None:
        project.position = payload.position
    db.commit()
    db.refresh(project)
    return project


@router.delete("/api/projects/{project_id}", status_code=204)
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> None:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == current_user.id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    # Unassign tasks that referenced this project
    db.query(Task).filter(Task.project_id == project_id).update(
        {Task.project_id: None}, synchronize_session=False
    )
    db.delete(project)
    db.commit()
