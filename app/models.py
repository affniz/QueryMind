from sqlalchemy import DateTime,ForeignKey,func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped,mapped_column,relationship
from datetime import datetime
from app.database import Base
from typing import Any, Optional

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(nullable=False, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),server_default=func.now(),nullable=False)

    datasets = relationship("Dataset", back_populates="owner", cascade="all, delete")
    folders = relationship("Folder", back_populates="owner", cascade="all, delete")

class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    owner = relationship("User", back_populates="folders")
    datasets = relationship("Dataset", back_populates="folder")
    chat_sessions = relationship("ChatSession", back_populates="folder", cascade="all, delete")

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
    folder_id: Mapped[Optional[int]] = mapped_column(ForeignKey("folders.id", ondelete="SET NULL"), nullable=True)

    owner = relationship("User", back_populates="datasets")
    folder = relationship("Folder", back_populates="datasets")
    # Dataset-scoped sessions (for uncategorized datasets only)
    chat_sessions = relationship("ChatSession", back_populates="dataset", cascade="all, delete")

class Relationship(Base):
    __tablename__ = "relationships"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    source_dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    source_column: Mapped[str] = mapped_column(nullable=False)
    target_dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    target_column: Mapped[str] = mapped_column(nullable=False)

    source_dataset = relationship("Dataset", foreign_keys=[source_dataset_id])
    target_dataset = relationship("Dataset", foreign_keys=[target_dataset_id])


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(nullable=False)
    # Exactly one of dataset_id or folder_id is set.
    # folder_id  → folder-scoped session (preferred for categorised datasets)
    # dataset_id → dataset-scoped session (uncategorised datasets)
    dataset_id: Mapped[Optional[int]] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), nullable=True)
    folder_id: Mapped[Optional[int]] = mapped_column(ForeignKey("folders.id", ondelete="CASCADE"), nullable=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    dataset = relationship("Dataset", back_populates="chat_sessions")
    folder = relationship("Folder", back_populates="chat_sessions")
    owner = relationship("User")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete", order_by="ChatMessage.created_at")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(nullable=False)          # "user" | "assistant"
    content: Mapped[str] = mapped_column(nullable=False)
    sql: Mapped[Optional[str]] = mapped_column(nullable=True)
    results: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    session = relationship("ChatSession", back_populates="messages")