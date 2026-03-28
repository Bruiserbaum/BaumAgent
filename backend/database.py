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
            migrations = [
                ("user_id",      "ALTER TABLE tasks ADD COLUMN user_id VARCHAR"),
                ("project_id",   "ALTER TABLE tasks ADD COLUMN project_id VARCHAR"),
                ("task_type",    "ALTER TABLE tasks ADD COLUMN task_type VARCHAR DEFAULT 'code'"),
                ("output_file",  "ALTER TABLE tasks ADD COLUMN output_file VARCHAR"),
                ("output_format","ALTER TABLE tasks ADD COLUMN output_format VARCHAR"),
                ("images",       "ALTER TABLE tasks ADD COLUMN images TEXT DEFAULT '[]'"),
                ("extra_data",   "ALTER TABLE tasks ADD COLUMN extra_data TEXT DEFAULT '{}'"),
            ]
            changed = False
            for col_name, sql in migrations:
                if col_name not in existing:
                    conn.execute(text(sql))
                    changed = True
            if changed:
                conn.commit()

        if "users" in inspector.get_table_names():
            existing = {col["name"] for col in inspector.get_columns("users")}
            migrations = [
                ("avatar_url", "ALTER TABLE users ADD COLUMN avatar_url VARCHAR"),
            ]
            changed = False
            for col_name, sql in migrations:
                if col_name not in existing:
                    conn.execute(text(sql))
                    changed = True
            if changed:
                conn.commit()


def init_db() -> None:
    import models.task  # noqa: F401 — ensure model is registered
    Base.metadata.create_all(bind=engine)
    _apply_migrations()
