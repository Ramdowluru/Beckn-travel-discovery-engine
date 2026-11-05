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


class SessionNotFoundError(Exception):
    """Raised when a session token does not identify a stored session."""


class SessionExpiredError(Exception):
    """Raised when a session is past its expiry time."""


class SessionRevokedError(Exception):
    """Raised when a session has been revoked."""


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _as_object_id(user_id: ObjectId | str) -> ObjectId:
    if isinstance(user_id, ObjectId):
        return user_id
    try:
        return ObjectId(user_id)
    except (InvalidId, TypeError) as error:
        raise ValueError("user_id must be a valid ObjectId.") from error


class SessionRepository:
    def __init__(self, database: AsyncDatabase, lifetime_seconds: int) -> None:
        self._collection: AsyncCollection[dict[str, Any]] = database["sessions"]
        self._lifetime_seconds = lifetime_seconds

    async def ensure_indexes(self) -> None:
        await self._collection.create_index(
            [("tokenHash", ASCENDING)],
            unique=True,
            name="sessions_token_hash_unique",
        )
        await self._collection.create_index(
            [("expiresAt", ASCENDING)],
            expireAfterSeconds=0,
            name="sessions_expiry",
        )

    async def create(self, *, user_id: ObjectId | str) -> tuple[str, dict[str, Any]]:
        token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        document = {
            "tokenHash": hash_session_token(token),
            "userId": _as_object_id(user_id),
            "createdAt": now,
            "expiresAt": now + timedelta(seconds=self._lifetime_seconds),
        }
        await self._collection.insert_one(document)
        return token, document

    async def get(self, *, token: str) -> dict[str, Any]:
        if not isinstance(token, str) or not token:
            raise SessionNotFoundError

        document = await self._collection.find_one({"tokenHash": hash_session_token(token)})
        if document is None:
            raise SessionNotFoundError
        if document.get("revokedAt") is not None:
            raise SessionRevokedError

        expires_at = document.get("expiresAt")
        if not isinstance(expires_at, datetime):
            raise SessionExpiredError
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            raise SessionExpiredError

        return document

    async def revoke(self, *, token: str) -> None:
        if not isinstance(token, str) or not token:
            return
        await self._collection.update_one(
            {"tokenHash": hash_session_token(token), "revokedAt": {"$exists": False}},
            {"$set": {"revokedAt": datetime.now(timezone.utc)}},
        )
