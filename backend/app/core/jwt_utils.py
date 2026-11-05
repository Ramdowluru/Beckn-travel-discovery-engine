"""JWT token generation and validation utilities."""
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from bson import ObjectId

from app.core.config import settings


def create_access_token(user_id: ObjectId | str) -> str:
    """Generate a short-lived JWT access token."""
    if isinstance(user_id, ObjectId):
        user_id_str = str(user_id)
    else:
        user_id_str = user_id
    
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    
    payload = {
        "sub": user_id_str,
        "iat": now,
        "exp": expire,
    }
    
    return jwt.encode(
        payload,
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def verify_access_token(token: str) -> dict[str, Any]:
    """Verify JWT access token signature and expiry.
    
    Raises:
        jwt.InvalidSignatureError: Token signature is invalid
        jwt.ExpiredSignatureError: Token has expired
        jwt.InvalidAlgorithmError: Token algorithm not allowed
        jwt.DecodeError: Token cannot be decoded
    """
    return jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
    )


def create_refresh_token() -> str:
    """Generate a long-lived opaque refresh token for DB storage."""
    import secrets
    return secrets.token_urlsafe(32)
