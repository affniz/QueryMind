from fastapi import FastAPI
from app.database import engine,Base
from app.routers import datasets,ask

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Data Insight API",
    description="Upload a CSV and ask plain-English questions about your data",
    version="1.0.0"
)

app.include_router(datasets.router,prefix="/datasets",tags=["datasets"])
app.include_router(ask.router,prefix="/datasets",tags=["ask"])

@app.get("/")
def root():
    return {"Message":"Data Insight API is running"}