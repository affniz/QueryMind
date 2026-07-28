from fastapi import FastAPI
from app.routers import datasets,ask,auth,relationships

app = FastAPI(
    title="Data Insight API",
    description="Upload a CSV and ask plain-English questions about your data",
    version="3.0.0"
)

app.include_router(datasets.router,prefix="/datasets",tags=["datasets"])
app.include_router(ask.router,prefix="/datasets",tags=["ask"])
app.include_router(auth.router)
app.include_router(relationships.router, prefix="/datasets/relationships", tags=["relationships"])

@app.get("/")
def root():
    return {"Message":"Data Insight API is running"}