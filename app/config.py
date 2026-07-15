from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    GROQ_API_KEY:str
    DATABASE_URL:str
    REDIS_URL:str = "redis://redis:6379"

    model_config = SettingsConfigDict(env_file=".env")

settings = Settings() # type: ignore[call-arg]