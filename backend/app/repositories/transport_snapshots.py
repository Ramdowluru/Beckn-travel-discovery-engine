from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from pymongo import ASCENDING
from pymongo.asynchronous.collection import AsyncCollection
from pymongo.asynchronous.database import AsyncDatabase


class SnapshotNotFoundError(Exception):
    """Raised when a requested search snapshot does not exist."""


class SnapshotExpiredError(Exception):
    """Raised when a requested search snapshot is past its expiry."""


class TransportSnapshotRepository:
    def __init__(self, database: AsyncDatabase, ttl_seconds: int) -> None:
        self._collection: AsyncCollection[dict[str, Any]] = database["transport_snapshots"]
        self._ttl_seconds = ttl_seconds

    async def ensure_indexes(self) -> None:
        await self._collection.create_index(
            [("transactionId", ASCENDING), ("offerId", ASCENDING)],
            unique=True,
            name="transport_snapshots_lookup_unique",
        )
        await self._collection.create_index(
            [("expiresAt", ASCENDING)],
            expireAfterSeconds=0,
            name="transport_snapshots_expiry",
        )

    async def save_many(
        self,
        *,
        transaction_id: str,
        query: dict[str, Any],
        offers: list[dict[str, Any]],
    ) -> None:
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=self._ttl_seconds)
        for offer in offers:
            offer_id = offer.get("id")
            if not isinstance(offer_id, str) or not offer_id.strip():
                continue
            document = {
                "transactionId": transaction_id,
                "offerId": offer_id,
                "offer": offer,
                "query": query,
                "createdAt": now,
                "expiresAt": expires_at,
            }
            await self._collection.replace_one(
                {"transactionId": transaction_id, "offerId": offer_id},
                document,
                upsert=True,
            )

    async def get(
        self,
        *,
        transaction_id: str,
        offer_id: str,
    ) -> dict[str, Any]:
        lookup = {"transactionId": transaction_id, "offerId": offer_id}
        document = await self._collection.find_one(lookup)
        if document is None:
            raise SnapshotNotFoundError

        expires_at = document.get("expiresAt")
        if not isinstance(expires_at, datetime):
            raise SnapshotExpiredError
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            raise SnapshotExpiredError

        offer = document.get("offer")
        query = document.get("query")
        if not isinstance(offer, dict) or not isinstance(query, dict):
            raise SnapshotNotFoundError
        return {"offer": offer, "query": query, "transaction_id": transaction_id}
