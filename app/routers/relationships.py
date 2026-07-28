from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select, or_
from app.database import get_db
from app.models import Dataset, Relationship, User
from app.schemas import RelationshipCreate, RelationshipResponse, RelationshipSuggestion
from app.auth import get_current_user

router = APIRouter()

def _get_owned_dataset(dataset_id: int, user_id: int, db: Session) -> Dataset:
    dataset = db.execute(select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == user_id)).scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail=f"Dataset with id {dataset_id} not found.")
    return dataset

@router.post("/", response_model=RelationshipResponse, status_code=status.HTTP_201_CREATED)
def create_relationship(body: RelationshipCreate,current_user:User=Depends(get_current_user),db:Session=Depends(get_db)):
    source = _get_owned_dataset(body.source_dataset_id, current_user.id, db)
    target = _get_owned_dataset(body.target_dataset_id, current_user.id, db)

    if body.source_column not in source.columns:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail=f"Column '{body.source_column}' not found in source dataset.")
    if body.target_column not in target.columns:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail=f"Column '{body.target_column}' not found in target dataset.")

    duplicate = db.execute(select(Relationship).where(Relationship.source_dataset_id == body.source_dataset_id,
            Relationship.source_column == body.source_column,
            Relationship.target_dataset_id == body.target_dataset_id,
            Relationship.target_column == body.target_column,)).scalar_one_or_none()
    if duplicate:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail="This relationship already exists.")

    rel = Relationship(**body.model_dump())
    db.add(rel)
    db.commit()
    db.refresh(rel)
    return rel

@router.get("/", response_model=list[RelationshipResponse])
def list_relationships(current_user:User=Depends(get_current_user),db:Session=Depends(get_db)):
    owned_ids = db.execute(select(Dataset.id).where(Dataset.user_id == current_user.id)).scalars().all()

    relationships = db.execute(
        select(Relationship).where(
            Relationship.source_dataset_id.in_(owned_ids),
            Relationship.target_dataset_id.in_(owned_ids),
        )
    ).scalars().all()
    return relationships

@router.delete("/{relationship_id}")
def delete_relationship(relationship_id: int,current_user: User = Depends(get_current_user),db: Session = Depends(get_db)):
    rel = db.execute(select(Relationship).where(Relationship.id == relationship_id)).scalar_one_or_none()
    if not rel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail=f"Relationship with id {relationship_id} not found.")

    _get_owned_dataset(rel.source_dataset_id, current_user.id, db)
    _get_owned_dataset(rel.target_dataset_id, current_user.id, db)

    db.delete(rel)
    db.commit()
    return {"message": f"Relationship {relationship_id} deleted successfully."}

@router.post("/auto-detect", response_model=list[RelationshipSuggestion])
def auto_detect_relationships(current_user: User = Depends(get_current_user),db: Session = Depends(get_db)):
    datasets = db.execute(select(Dataset).where(Dataset.user_id == current_user.id)).scalars().all()
    suggestions = []

    for i, ds_a in enumerate(datasets):
        for ds_b in datasets[i + 1:]:
            cols_a = set(ds_a.columns.keys())
            cols_b = set(ds_b.columns.keys())

            # Strip .csv to get base name for pattern matching
            name_a = ds_a.name.rsplit(".", 1)[0].lower()  # e.g. "customers"
            name_b = ds_b.name.rsplit(".", 1)[0].lower()  # e.g. "orders"

            singular_a = name_a[:-1] if name_a.endswith('s') else name_a
            singular_b = name_b[:-1] if name_b.endswith('s') else name_b

            # High confidence: column "X_id" in A matches "id" in B, where B's name is X
            for col in cols_a:
                if col in (f"{name_b}_id", f"{singular_b}_id") and "id" in cols_b:
                    suggestions.append(RelationshipSuggestion(
                        source_dataset_id=ds_a.id,
                        source_column=col,
                        target_dataset_id=ds_b.id,
                        target_column="id",
                        confidence="high",
                        source_dataset_name=ds_a.name,
                        target_dataset_name=ds_b.name,
                    ))
            # Same check flipped (col in B points to A)
            for col in cols_b:
                if col in (f"{name_a}_id", f"{singular_a}_id") and "id" in cols_a:
                    suggestions.append(RelationshipSuggestion(
                        source_dataset_id=ds_b.id,
                        source_column=col,
                        target_dataset_id=ds_a.id,
                        target_column="id",
                        confidence="high",
                        source_dataset_name=ds_b.name,
                        target_dataset_name=ds_a.name,
                    ))
            # Low confidence: exact column name match (excluding generic names)
            SKIP = {"id", "name", "date", "created_at", "updated_at"}
            shared = (cols_a & cols_b) - SKIP
            for col in shared:
                suggestions.append(RelationshipSuggestion(
                    source_dataset_id=ds_a.id,
                    source_column=col,
                    target_dataset_id=ds_b.id,
                    target_column=col,
                    confidence="low",
                    source_dataset_name=ds_a.name,
                    target_dataset_name=ds_b.name,
                ))

    return suggestions