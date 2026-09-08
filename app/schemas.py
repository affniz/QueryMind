from pydantic import BaseModel
from datetime import datetime
from typing import Any, Optional

class FolderCreate(BaseModel):
    name: str

class FolderResponse(BaseModel):
    id: int
    name: str
    created_at: datetime
    model_config = {"from_attributes": True}

class DatasetBase(BaseModel):
    name:str
    row_count:int
    columns:dict

class DatasetResponse(DatasetBase):
    id:int
    uploaded_at:datetime
    table_name:str
    folder_id: Optional[int] = None
    model_config={"from_attributes":True}

class DatasetMoveFolder(BaseModel):
    folder_id: Optional[int] = None

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
    # When provided, the assistant message and SQL/results will be persisted
    # to this chat session after a successful response.
    session_id: int | None = None

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

# ── Chat session schemas ────────────────────────────────────────────────────────

class ChatSessionCreate(BaseModel):
    title: str

class ChatSessionRename(BaseModel):
    title: str

class ChatMessageResponse(BaseModel):
    id: int
    session_id: int
    role: str
    content: str
    sql: Optional[str] = None
    results: Optional[list[Any]] = None
    created_at: datetime
    model_config = {"from_attributes": True}

class ChatSessionResponse(BaseModel):
    id: int
    title: str
    dataset_id: Optional[int] = None
    folder_id: Optional[int] = None
    user_id: int
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

class ChatSessionDetailResponse(ChatSessionResponse):
    messages: list[ChatMessageResponse] = []