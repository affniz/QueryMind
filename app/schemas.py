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
    

class HistoryEntry(BaseModel):
    role: str   # "user" | "assistant"
    content: str

class AskRequest(BaseModel):
    question: str
    history: list[HistoryEntry] = []
    # IDs of all datasets in the same folder as the queried dataset.
    # When provided, the LLM context is scoped to only these datasets,
    # preventing cross-folder data leakage.
    folder_dataset_ids: list[int] | None = None

class AskResponse(BaseModel):
    question:str
    sql_query:str
    answer:str
    row_count:int
    results: list[dict]

class UserCreate(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    id: int
    email: str
    created_at: datetime  
    model_config ={"from_attributes":True}

class Token(BaseModel):
    access_token: str
    token_type: str