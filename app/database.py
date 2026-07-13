from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker,DeclarativeBase
from .config import settings

class Base(DeclarativeBase):
    pass

DATABASE_URL = settings.DATABASE_URL

engine=create_engine(DATABASE_URL)

SessionLocal = sessionmaker(bind=engine,autocommit=False,autoflush=False)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()