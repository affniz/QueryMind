from sqlalchemy import DateTime,ForeignKey,func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped,mapped_column,relationship
from datetime import datetime
from app.database import Base
from typing import Any

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(nullable=False, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(nullable=False)

    datasets = relationship("Dataset", back_populates="owner", cascade="all, delete")

class Dataset(Base):
    __tablename__="datasets"

    id:Mapped[int] = mapped_column(primary_key=True,index=True)
    name:Mapped[str] = mapped_column(nullable=False)
    uploaded_at:Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
        )
    row_count:Mapped[int] = mapped_column(nullable=False)
    columns: Mapped[dict[str, Any]] = mapped_column(JSONB,nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    records = relationship("Record",back_populates="dataset",cascade="all, delete")
    owner = relationship("User", back_populates="datasets")

class Record(Base):
    __tablename__="records"

    id:Mapped[int]=mapped_column(primary_key=True,index=True)
    dataset_id:Mapped[int]=mapped_column(ForeignKey("datasets.id"),nullable=False)
    data:Mapped[dict[str,Any]]=mapped_column(JSONB,nullable=False)

    dataset = relationship("Dataset",back_populates="records")