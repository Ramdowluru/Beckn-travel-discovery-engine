from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ASCENDING
from pymongo.errors import DuplicateKeyError
from pymongo.asynchronous.collection import AsyncCollection
from pymongo.asynchronous.database import AsyncDatabase


class DuplicateEmailError(Exception):
    """Raised when an account already exists for a normalized email address."""


def normalize_email(email: str) -> str:
    return email.strip().lower()


def to_public_user(user: dict[str, Any] | None) -> dict[str, str] | None:
    """Serialize a stored user without exposing its password hash or timestamps."""
    if user is None:
        return None

    return {
        "id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
    }


class UserRepository:
    def __init__(self, database: AsyncDatabase) -> None:
        self._collection: AsyncCollection[dict[str, Any]] = database["users"]

    async def ensure_indexes(self) -> None:
        await self._collection.create_index(
            [("email", ASCENDING)],
            unique=True,
            name="users_email_unique",
        )

    async def create(
        self,
        *,
        name: str,
        email: str,
        password_hash: str,
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        document = {
            "_id": ObjectId(),
            "name": name.strip(),
            "email": normalize_email(email),
            "passwordHash": password_hash,
            "createdAt": now,
            "updatedAt": now,
        }

        try:
            await self._collection.insert_one(document)
        except DuplicateKeyError as exc:
            raise DuplicateEmailError(
                f"An account already exists for {document['email']}"
            ) from exc

        return document

    async def get_by_email(self, email: str) -> dict[str, Any] | None:
        return await self._collection.find_one({"email": normalize_email(email)})

    async def get_by_id(self, user_id: ObjectId | str) -> dict[str, Any] | None:
        try:
            object_id = user_id if isinstance(user_id, ObjectId) else ObjectId(user_id)
        except InvalidId:
            return None

        return await self._collection.find_one({"_id": object_id})
