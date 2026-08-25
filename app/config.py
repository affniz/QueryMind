from typing import List, Optional
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    GROQ_API_KEY: str
    GROQ_MODEL: str
    DATABASE_URL: str
    READONLY_DATABASE_URL: Optional[str] = None
    REDIS_URL: str = "redis://redis:6379"
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    MAX_SQL_RETRIES: int = 3
    RATE_LIMIT_REQUESTS: int = 10
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    CORS_ORIGINS: List[str] = Field(
        default=[
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
        ]
    )

    @field_validator("DATABASE_URL", "READONLY_DATABASE_URL", mode="before")
    @classmethod
    def fix_db_url(cls, v: Optional[str]) -> Optional[str]:
        """Render injects postgres:// or postgresql+psycopg2:// — rewrite to psycopg v3."""
        if v is None:
            return v
        v = v.replace("postgres://", "postgresql+psycopg://", 1)
        v = v.replace("postgresql://", "postgresql+psycopg://", 1)
        v = v.replace("postgresql+psycopg2://", "postgresql+psycopg://", 1)
        return v

    @model_validator(mode="after")
    def set_readonly_database_url(self) -> "Settings":
        if not self.READONLY_DATABASE_URL:
            self.READONLY_DATABASE_URL = self.DATABASE_URL
        return self

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: str | List[str]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [origin.strip() for origin in v.split(",")]
        return v

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()  # type: ignore[call-arg]