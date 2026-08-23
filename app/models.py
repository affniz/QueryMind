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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),server_default=func.now(),nullable=False)

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
    table_name: Mapped[str] = mapped_column(nullable=False, unique=True)

    owner = relationship("User", back_populates="datasets")

class Relationship(Base):
    __tablename__ = "relationships"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    source_dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    source_column: Mapped[str] = mapped_column(nullable=False)
    target_dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    target_column: Mapped[str] = mapped_column(nullable=False)

    source_dataset = relationship("Dataset", foreign_keys=[source_dataset_id])
    target_dataset = relationship("Dataset", foreign_keys=[target_dataset_id])