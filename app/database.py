from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Session
from .config import settings
from typing import Generator


class Base(DeclarativeBase):
    pass


engine = create_engine(settings.DATABASE_URL)
readonly_engine = create_engine(settings.READONLY_DATABASE_URL)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
ReadOnlySession = sessionmaker(bind=readonly_engine, autocommit=False, autoflush=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_readonly_db() -> Generator[Session, None, None]:
    db = ReadOnlySession()
    try:
        yield db
    finally:
        db.close()