from fastapi import HTTPException, Request, status

from app.core.database import get_db
from app.core.security import session_token
from app.repositories.sessions import (
    SessionExpiredError,
    SessionNotFoundError,
    SessionRepository,
    SessionRevokedError,
)
from app.repositories.users import UserRepository
from app.core.config import settings


async def get_current_user(request: Request) -> dict:
    token = session_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication is required.",
        )

    try:
        session = await SessionRepository(
            get_db(),
            settings.session_lifetime_seconds,
        ).get(token=token)
    except (SessionNotFoundError, SessionExpiredError, SessionRevokedError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication is required.",
        ) from error

    user = await UserRepository(get_db()).get_by_id(session["userId"])
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication is required.",
        )
    return user
