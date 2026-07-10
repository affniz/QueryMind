from fastapi import APIRouter,Depends,HTTPException,status
from sqlalchemy.orm import Session
from sqlalchemy import select,text
from app.database import get_db
from app.models import Dataset,Record
from app.schemas import AskRequest,AskResponse
from groq import Groq
from dotenv import load_dotenv
import os
import json

load_dotenv()

router = APIRouter()
key=os.getenv("GROQ_API_KEY")
client = Groq(api_key=key)

def clean_sql(sql:str)->str:
    sql=sql.strip()
    if sql.startswith("'''"):
        sql=sql.split("\n",1)[-1]
    if sql.endswith("'''"):
        sql=sql.rsplit("'''",1)[0]
    return sql.strip()

def is_relevant_question(question:str,columns:dict)->bool:
    schema_str = json.dumps(columns,indent=2)
    reponse=client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role":"user",
                "content":"""You are a query validator. Given a dataset schema and a question,
                determine if the question is relevant to the dataset.
                Reply with ONLY 'yes' or 'no',nothing else."""
            },
            {
                "role":"user",
                "content":f"Schema:\n{schema_str}\n\nQuestion: {question}"
            }
        ]
    )
    answer = reponse.choices[0].message.content.strip().lower() # type: ignore[union-attr]
    return answer=="yes"

def build_schema_prompt(dataset:Dataset)->str:
    schema_str = json.dumps(dataset.columns,indent=2)
    return f"""You are a PostgreSQL expert. Given the following table schema,write a valid SQL query to answer the user's question. 
    The table is called 'records' and has two columns:
    -'dataset_id'(integer) - a real table column,NOT inside the JSONB. Always filter with: dataset_id={dataset.id}
    -'data'(JSONB) - stores each row's fields. Access with: data->>'field_name' for text, or (data->>'field_name)::float for numbers. 
    When filtering text fields, always use ILIKE with wildcards for flexible matching instead of =.
    for example: data->>'product' ILIKE '%laptop% instead of data->>'product' = 'Laptop'
    Always filter by dataset_id={dataset.id} using the real column,not JSONB syntax.
    Return ONLY the raw SQL query, no explanation, no markdown,no backticks. 
    Schema(column names and types):
    {schema_str}"""

def build_answer_prompt(question:str,sql_query:str,results:list)->str:
    return f"""You are a data analyst. A user asked the following question about their data:
    Question: {question}
The Following SQL query was run:{sql_query}
The query returned these results:
{json.dumps(results,indent=2)}
Please provide a clear,consise plain-English answer to the user's question based on these results."""

@router.post("/{dataset_id}/ask",response_model=AskResponse)
def ask_question(dataset_id:int,request:AskRequest,db:Session=Depends(get_db)):
    dataset=db.execute(select(Dataset).where(Dataset.id==dataset_id)).scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail=f"Dataset with id {dataset_id} not found")
    if not is_relevant_question(request.question,dataset.columns):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail="Your Question doesn't apper to be relevant to this dataset.")
    schema_prompt = build_schema_prompt(dataset)
    sql_response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role":"system","content":schema_prompt},
            {"role":"user","content":request.question}
        ]
    )
    sql_query = sql_response.choices[0].message.content.strip() # type: ignore[union-attr]
    sql_query = clean_sql(sql_query)
    try:
        results=db.execute(text(sql_query)).mappings().all()
        results=[dict(row) for row in results] # type: ignore[misc]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail=f"Generated SQL query failed to execute: {str(e)}")
    
    answer_response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role":"user","content":build_answer_prompt(request.question,sql_query,results)}
        ]
    )
    answer = answer_response.choices[0].message.content.strip() # type: ignore[union-attr]

    return AskResponse(
        question=request.question,
        sql_query=sql_query,
        answer=answer,
        row_count=len(results)
    )