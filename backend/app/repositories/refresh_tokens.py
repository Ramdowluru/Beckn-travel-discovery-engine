"""Refresh token management for JWT rotation and logout revocation."""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ASCENDING
from pymongo.asynchronous.collection import AsyncCollection
from pymongo.asynchronous.database import AsyncDatabase


class RefreshTokenNotFoundError(Exception):
    """Raised when a refresh token does not identify a stored token."""


class RefreshTokenExpiredError(Exception):
    """Raised when a refresh token is past its expiry time."""


class RefreshTokenRevokedError(Exception):
    """Raised when a refresh token has been revoked (user logged out)."""


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _as_object_id(user_id: ObjectId | str) -> ObjectId:
    if isinstance(user_id, ObjectId):
        return user_id
    try:
        return ObjectId(user_id)
    except (InvalidId, TypeError) as error:
        raise ValueError("user_id must be a valid ObjectId.") from error


class RefreshTokenRepository:
    def __init__(self, database: AsyncDatabase, lifetime_days: int) -> None:
        self._collection: AsyncCollection[dict[str, Any]] = database["refresh_tokens"]
        self._lifetime_seconds = lifetime_days * 86400

    async def ensure_indexes(self) -> None:
        await self._collection.create_index(
            [("tokenHash", ASCENDING)],
            unique=True,
            name="refresh_tokens_hash_unique",
        )
        await self._collection.create_index(
            [("expiresAt", ASCENDING)],
            expireAfterSeconds=0,
            name="refresh_tokens_expiry",
        )
        await self._collection.create_index(
            [("userId", ASCENDING)],
            name="refresh_tokens_user_id",
        )

    async def create(self, *, user_id: ObjectId | str) -> tuple[str, dict[str, Any]]:
        """Create a new refresh token."""
        token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        document = {
            "tokenHash": hash_refresh_token(token),
            "userId": _as_object_id(user_id),
            "createdAt": now,
            "expiresAt": now + timedelta(seconds=self._lifetime_seconds),
        }
        await self._collection.insert_one(document)
        return token, document

    async def get(self, *, token: str) -> dict[str, Any]:
        """Retrieve and validate a refresh token."""
        if not isinstance(token, str) or not token:
            raise RefreshTokenNotFoundError

        document = await self._collection.find_one({"tokenHash": hash_refresh_token(token)})
        if document is None:
            raise RefreshTokenNotFoundError
        if document.get("revokedAt") is not None:
            raise RefreshTokenRevokedError

        expires_at = document.get("expiresAt")
        if not isinstance(expires_at, datetime):
            raise RefreshTokenExpiredError
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            raise RefreshTokenExpiredError

        return document

    async def revoke(self, *, token: str) -> None:
        """Revoke a refresh token (logout)."""
        if not isinstance(token, str) or not token:
            return
        await self._collection.update_one(
            {"tokenHash": hash_refresh_token(token), "revokedAt": {"$exists": False}},
            {"$set": {"revokedAt": datetime.now(timezone.utc)}},
        )

    async def revoke_all_for_user(self, *, user_id: ObjectId | str) -> None:
        """Revoke all refresh tokens for a user (security: password change, etc.)."""
        await self._collection.update_many(
            {"userId": _as_object_id(user_id), "revokedAt": {"$exists": False}},
            {"$set": {"revokedAt": datetime.now(timezone.utc)}},
        )
