from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.database import get_db
from app.models import Folder, User
from app.schemas import FolderCreate, FolderResponse
from app.auth import get_current_user

router = APIRouter()


@router.get("/", response_model=list[FolderResponse])
async def get_folders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    folders = db.execute(
        select(Folder).where(Folder.user_id == current_user.id).order_by(Folder.created_at)
    ).scalars().all()
    return folders


@router.post("/", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(
    folder: FolderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.execute(
        select(Folder).where(Folder.user_id == current_user.id, Folder.name == folder.name)
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A folder named '{folder.name}' already exists.",
        )
    new_folder = Folder(name=folder.name, user_id=current_user.id)
    db.add(new_folder)
    db.commit()
    db.refresh(new_folder)
    return new_folder


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    folder_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    folder = db.execute(
        select(Folder).where(Folder.id == folder_id, Folder.user_id == current_user.id)
    ).scalar_one_or_none()
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Folder {folder_id} not found.",
        )
    db.delete(folder)
    db.commit()
