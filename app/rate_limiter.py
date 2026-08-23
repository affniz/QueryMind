import logging

import redis as redis_lib
from fastapi import Depends, HTTPException, status

from app.auth import get_current_user
from app.cache import cache
from app.config import settings
from app.models import User

logger = logging.getLogger(__name__)


def check_rate_limit(current_user: User = Depends(get_current_user)) -> None:
    """FastAPI dependency that enforces a per-user sliding-window rate limit on /ask.

    Uses a simple Redis INCR + EXPIRE strategy:
    - On the first request in a window, the key is created with a TTL equal to RATE_LIMIT_WINDOW_SECONDS.
    - Each subsequent request in the same window increments the counter.
    - Once the counter exceeds RATE_LIMIT_REQUESTS the request is rejected with HTTP 429.

    Redis failures are logged and silently bypassed (fail-open) to avoid making the
    rate limiter a hard dependency of the ask endpoint.
    """
    key = f"rate_limit:ask:{current_user.id}"
    limit = settings.RATE_LIMIT_REQUESTS
    window = settings.RATE_LIMIT_WINDOW_SECONDS

    try:
        count = cache.incr(key)
        if count == 1:
            # First request in this window — set the expiry
            cache.expire(key, window)
        if count > limit:
            ttl = cache.ttl(key)
            retry_after = ttl if ttl > 0 else window
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Rate limit exceeded: {limit} requests per {window}s allowed. "
                    f"Try again in {retry_after}s."
                ),
                headers={"Retry-After": str(retry_after)},
            )
    except HTTPException:
        raise
    except redis_lib.RedisError as e:
        logger.warning("Rate limiter Redis error (bypassing): %s", e)
