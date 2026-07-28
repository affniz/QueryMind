from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy import select,or_
from sqlalchemy.orm import Session
from app.database import get_db, engine
from app.models import Dataset, Relationship, User
from app.schemas import DatasetResponse
from app.auth import get_current_user
from app.table_manager import (
    generate_table_name,
    create_dynamic_table,
    insert_into_dynamic_table,
    drop_dynamic_table,
)
import pandas as pd
import io

router = APIRouter()

@router.post("/upload",response_model=DatasetResponse)
def upload_csv(file:UploadFile=File(...),current_user: User = Depends(get_current_user),db:Session=Depends(get_db)):
    if not file.filename.endswith(".csv"):# type: ignore[union-attr]
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail="Only CSV files are accepted.")
    
    contents=file.file.read()
    df = pd.read_csv(io.BytesIO(contents))

    if df.empty:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail="Uploaded CSV is empty.")
    
    df = df.where(pd.notnull(df),None)
    empty_columns = [col for col in df.columns if df[col].isnull().all()]
    if empty_columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"These columns are entirely empty: {empty_columns}. Please clean your CSV before uploading."
        )

    column_types = {col:str(df[col].dtype) for col in df.columns}

    dataset = Dataset(
        name=file.filename,
        table_name="",
        row_count=len(df),
        columns=column_types,
        user_id=current_user.id,
    )
    db.add(dataset)
    db.flush()

    table_name = generate_table_name(current_user.id, dataset.id, file.filename)  # type: ignore[arg-type]
    dataset.table_name = table_name
    try:
        create_dynamic_table(engine, table_name, df)
        insert_into_dynamic_table(engine, table_name, df)
    except Exception as e:
        db.rollback()
        drop_dynamic_table(engine, table_name)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,detail=f"Failed to create table for dataset: {str(e)}")

    db.commit()
    db.refresh(dataset)

    return dataset

@router.get("/",response_model=list[DatasetResponse])
def get_datasets(current_user: User = Depends(get_current_user),db:Session=Depends(get_db)):
    datasets = db.execute(select(Dataset).where(Dataset.user_id == current_user.id)).scalars().all()
    return datasets

@router.get("/{dataset_id}",response_model=DatasetResponse)
def get_dataset(dataset_id:int,current_user: User = Depends(get_current_user),db:Session=Depends(get_db)):
    dataset = db.execute(select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == current_user.id)).scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail=f"Dataset with id {dataset_id} not found.")
    return dataset

@router.delete("/{dataset_id}")
def delete_dataset(dataset_id:int,current_user: User = Depends(get_current_user),db:Session=Depends(get_db)):
    dataset = db.execute(select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == current_user.id)).scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail=f"Dataset with id {dataset_id} not found.")
    
    relationships = db.execute(select(Relationship).where(or_(Relationship.source_dataset_id == dataset_id, Relationship.target_dataset_id == dataset_id))).scalars().all()
    for rel in relationships:
        db.delete(rel)
    
    drop_dynamic_table(engine, dataset.table_name)

    db.delete(dataset)
    db.commit()
    return {"message":f"Dataset {dataset_id} deleted successfully."}