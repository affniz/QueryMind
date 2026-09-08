"""
Chat session management endpoints.

Dataset-scoped  (prefix: /datasets/{dataset_id}):
  GET  /datasets/{dataset_id}/chats    — list sessions for an uncategorised dataset
  POST /datasets/{dataset_id}/chats    — create dataset-scoped session

Folder-scoped   (prefix: /folders/{folder_id}):
  GET  /folders/{folder_id}/chats      — list sessions for a folder
  POST /folders/{folder_id}/chats      — create folder-scoped session

Session-level   (prefix: /chats):
  GET    /chats/{session_id}           — get session + messages
  PATCH  /chats/{session_id}           — rename session
  DELETE /chats/{session_id}           — delete session
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import ChatSession, Dataset, Folder, User
from app.schemas import (
    ChatSessionCreate,
    ChatSessionDetailResponse,
    ChatSessionRename,
    ChatSessionResponse,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_owned_session(session_id: int, current_user: User, db: Session) -> ChatSession:
    session = db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chat session {session_id} not found.",
        )
    return session


# ---------------------------------------------------------------------------
# Dataset-scoped routes  (for uncategorised datasets)
# ---------------------------------------------------------------------------

@router.get("/{dataset_id}/chats", response_model=list[ChatSessionResponse])
def list_dataset_sessions(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all dataset-scoped chat sessions, newest first."""
    dataset = db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
    ).scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found.")

    sessions = db.execute(
        select(ChatSession)
        .where(ChatSession.dataset_id == dataset_id, ChatSession.user_id == current_user.id)
        .order_by(ChatSession.updated_at.desc())
    ).scalars().all()
    return sessions


@router.post("/{dataset_id}/chats", response_model=ChatSessionResponse, status_code=status.HTTP_201_CREATED)
def create_dataset_session(
    dataset_id: int,
    body: ChatSessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new dataset-scoped chat session."""
    dataset = db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
    ).scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found.")

    new_session = ChatSession(
        title=body.title,
        dataset_id=dataset_id,
        user_id=current_user.id,
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session


# ---------------------------------------------------------------------------
# Folder-scoped routes
# ---------------------------------------------------------------------------

@router.get("/{folder_id}/chats", response_model=list[ChatSessionResponse])
def list_folder_sessions(
    folder_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all folder-scoped chat sessions, newest first."""
    folder = db.execute(
        select(Folder).where(Folder.id == folder_id, Folder.user_id == current_user.id)
    ).scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found.")

    sessions = db.execute(
        select(ChatSession)
        .where(ChatSession.folder_id == folder_id, ChatSession.user_id == current_user.id)
        .order_by(ChatSession.updated_at.desc())
    ).scalars().all()
    return sessions


@router.post("/{folder_id}/chats", response_model=ChatSessionResponse, status_code=status.HTTP_201_CREATED)
def create_folder_session(
    folder_id: int,
    body: ChatSessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new folder-scoped chat session."""
    folder = db.execute(
        select(Folder).where(Folder.id == folder_id, Folder.user_id == current_user.id)
    ).scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found.")

    new_session = ChatSession(
        title=body.title,
        folder_id=folder_id,
        user_id=current_user.id,
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session


# ---------------------------------------------------------------------------
# Session-level routes  (shared for both scopes)
# ---------------------------------------------------------------------------

@router.get("/{session_id}", response_model=ChatSessionDetailResponse)
def get_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_owned_session(session_id, current_user, db)


@router.patch("/{session_id}", response_model=ChatSessionResponse)
def rename_session(
    session_id: int,
    body: ChatSessionRename,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = _get_owned_session(session_id, current_user, db)
    session.title = body.title.strip() or session.title
    db.commit()
    db.refresh(session)
    return session


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = _get_owned_session(session_id, current_user, db)
    db.delete(session)
    db.commit()
