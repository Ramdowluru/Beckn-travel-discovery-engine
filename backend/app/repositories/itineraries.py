from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError
from pymongo.asynchronous.collection import AsyncCollection
from pymongo.asynchronous.database import AsyncDatabase


class ItineraryRepository:
    def __init__(self, database: AsyncDatabase) -> None:
        self._collection: AsyncCollection[dict[str, Any]] = database["saved_itineraries"]

    async def ensure_indexes(self) -> None:
        await self._collection.create_index(
            [("userId", ASCENDING), ("sourceTransactionId", ASCENDING), ("sourceOfferId", ASCENDING)],
            unique=True,
            name="saved_itineraries_user_source_unique",
        )
        await self._collection.create_index(
            [("userId", ASCENDING), ("createdAt", DESCENDING)],
            name="saved_itineraries_user_created",
        )

    async def save_or_get(
        self,
        *,
        user_id: ObjectId,
        transaction_id: str,
        offer_id: str,
        offer: dict[str, Any],
        query: dict[str, Any],
    ) -> dict[str, Any]:
        lookup = {
            "userId": user_id,
            "sourceTransactionId": transaction_id,
            "sourceOfferId": offer_id,
        }
        existing = await self._collection.find_one(lookup)
        if existing is not None:
            return existing

        now = datetime.now(timezone.utc)
        document = {
            "_id": ObjectId(),
            "itineraryId": str(uuid4()),
            **lookup,
            "transport": offer,
            "query": query,
            "priceStatus": "saved_estimate",
            "createdAt": now,
            "updatedAt": now,
        }
        try:
            await self._collection.insert_one(document)
        except DuplicateKeyError:
            existing = await self._collection.find_one(lookup)
            if existing is None:
                raise
            return existing
        return document

    async def list_for_user(self, *, user_id: ObjectId) -> list[dict[str, Any]]:
        cursor = self._collection.find({"userId": user_id}).sort("createdAt", DESCENDING)
        return await cursor.to_list(length=100)

    async def get_for_user(
        self,
        *,
        user_id: ObjectId,
        itinerary_id: str,
    ) -> dict[str, Any] | None:
        return await self._collection.find_one(
            {"userId": user_id, "itineraryId": itinerary_id}
        )
