from fastapi import APIRouter,Depends,HTTPException,status,UploadFile,File
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Dataset,Record
from app.schemas import DatasetResponse
import pandas as pd
import io

router=APIRouter()

@router.post("/upload",response_model=DatasetResponse)
def upload_csv(file:UploadFile=File(...),db:Session=Depends(get_db)):
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
            detail=f"These columns are entirely empty: {empty_columns}. Please clean yourr CSV before uploading."
        )

    column_types = {col:str(df[col].dtype) for col in df.columns}

    dataset = Dataset(
        name=file.filename,
        row_count=len(df),
        columns=column_types
        )
    db.add(dataset)
    db.flush()

    records = [Record(dataset_id=dataset.id,data=row.to_dict()) for _, row in df .iterrows()]
    db.bulk_save_objects(records)
    db.commit()
    db.refresh(dataset)

    return dataset

@router.get("/",response_model=list[DatasetResponse])
def get_datasets(db:Session=Depends(get_db)):
    datasets = db.execute(select(Dataset)).scalars().all()
    return datasets

@router.get("/{dataset_id}",response_model=DatasetResponse)
def get_dataset(dataset_id:int,db:Session=Depends(get_db)):
    dataset = db.execute(select(Dataset).where(Dataset.id==dataset_id)).scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail=f"Dataset with id {dataset_id} not found.")
    return dataset

@router.delete("/{dataset_id}")
def delete_dataset(dataset_id:int,db:Session=Depends(get_db)):
    dataset = db.execute(select(Dataset).where(Dataset.id==dataset_id)).scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail=f"Dataset with id {dataset_id} not found.")
    db.delete(dataset)
    db.commit()
    return {"message":f"Dataset {dataset_id} deleted successfully."}