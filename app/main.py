from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import datasets, ask, auth, relationships
from app.config import settings

app = FastAPI(
    title="Data Insight API",
    description="Upload a CSV and ask plain-English questions about your data",
    version="5.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(datasets.router, prefix="/datasets", tags=["datasets"])
app.include_router(ask.router, prefix="/datasets", tags=["ask"])
app.include_router(auth.router)
app.include_router(relationships.router, prefix="/datasets/relationships", tags=["relationships"])


@app.get("/")
def root():
    return {"Message": "Data Insight API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}