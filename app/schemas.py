from pydantic import BaseModel
from datetime import datetime
from typing import Any

class DatasetBase(BaseModel):
    name:str
    row_count:int
    columns:dict

class DatasetResponse(DatasetBase):
    id:int
    uploaded_at:datetime

    model_config={"from_attributes":True}

class RecordResponse(BaseModel):
    id:int
    dataset_id:int
    data:dict

    model_config={"from_attributes":True}

class AskRequest(BaseModel):
    question:str

class AskResponse(BaseModel):
    question:str
    sql_query:str
    answer:str
    row_count:int