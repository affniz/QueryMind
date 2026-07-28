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
    table_name:str
    model_config={"from_attributes":True}

class RelationshipCreate(BaseModel):
    source_dataset_id:int
    source_column:str
    target_dataset_id:int
    target_column:str

class RelationshipResponse(RelationshipCreate):
    id:int
    model_config={"from_attributes":True}

class RelationshipSuggestion(RelationshipCreate):
    confidence:str
    source_dataset_name:str
    target_dataset_name:str
    

class AskRequest(BaseModel):
    question:str

class AskResponse(BaseModel):
    question:str
    sql_query:str
    answer:str
    row_count:int

class UserCreate(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    id: int
    email: str
    model_config ={"from_attributes":True}

class Token(BaseModel):
    access_token: str
    token_type: str