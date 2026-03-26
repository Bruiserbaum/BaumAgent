from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _apply_migrations() -> None:
    """Add any missing columns to existing tables (forward-only, SQLite-compatible)."""
    from sqlalchemy import text, inspect as sa_inspect
    inspector = sa_inspect(engine)
    with engine.connect() as conn:
        if "tasks" in inspector.get_table_names():
            existing = {col["name"] for col in inspector.get_columns("tasks")}
            if "user_id" not in existing:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN user_id VARCHAR"))
            if "project_id" not in existing:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN project_id VARCHAR"))
            conn.commit()


def init_db() -> None:
    import models.task  # noqa: F401 — ensure model is registered
    Base.metadata.create_all(bind=engine)
    _apply_migrations()
