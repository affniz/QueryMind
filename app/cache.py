import redis
from .config import settings

cache=redis.Redis.from_url(settings.REDIS_URL)