from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any
from uuid import uuid4

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING, ReturnDocument
from pymongo.asynchronous.collection import AsyncCollection
from pymongo.asynchronous.database import AsyncDatabase


class TripRepository:
    def __init__(self, database: AsyncDatabase) -> None:
        self._collection: AsyncCollection[dict[str, Any]] = database["trips"]

    async def ensure_indexes(self) -> None:
        await self._collection.create_index(
            [("userId", ASCENDING), ("tripId", ASCENDING)],
            unique=True,
            name="trips_user_trip_unique",
        )
        await self._collection.create_index(
            [("userId", ASCENDING), ("updatedAt", DESCENDING)],
            name="trips_user_updated",
        )

    async def create(
        self,
        *,
        user_id: ObjectId,
        title: str,
        destination: str,
        start_date: date,
        end_date: date,
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        document = {
            "_id": ObjectId(),
            "tripId": str(uuid4()),
            "userId": user_id,
            "title": title,
            "destination": destination,
            "startDate": start_date.isoformat(),
            "endDate": end_date.isoformat(),
            "bookingIds": [],
            "createdAt": now,
            "updatedAt": now,
        }
        await self._collection.insert_one(document)
        return document

    async def list_for_user(self, user_id: ObjectId) -> list[dict[str, Any]]:
        cursor = self._collection.find({"userId": user_id}).sort("updatedAt", DESCENDING)
        return await cursor.to_list(length=100)

    async def get_for_user(self, user_id: ObjectId, trip_id: str) -> dict[str, Any] | None:
        return await self._collection.find_one({"userId": user_id, "tripId": trip_id})

    async def update_for_user(
        self,
        user_id: ObjectId,
        trip_id: str,
        fields: dict[str, Any],
    ) -> dict[str, Any] | None:
        values: dict[str, Any] = {"updatedAt": datetime.now(timezone.utc)}
        query: dict[str, Any] = {"userId": user_id, "tripId": trip_id}
        if "start_date" in fields and "end_date" not in fields:
            query["endDate"] = {"$gte": fields["start_date"].isoformat()}
        elif "end_date" in fields and "start_date" not in fields:
            query["startDate"] = {"$lte": fields["end_date"].isoformat()}
        for field, value in fields.items():
            values[{"start_date": "startDate", "end_date": "endDate"}.get(field, field)] = (
                value.isoformat() if isinstance(value, date) else value
            )
        return await self._collection.find_one_and_update(
            query,
            {"$set": values},
            return_document=ReturnDocument.AFTER,
        )

    async def add_booking_reference(
        self,
        user_id: ObjectId,
        trip_id: str,
        booking_id: str,
    ) -> dict[str, Any] | None:
        return await self._collection.find_one_and_update(
            {"userId": user_id, "tripId": trip_id},
            {
                "$addToSet": {"bookingIds": booking_id},
                "$set": {"updatedAt": datetime.now(timezone.utc)},
            },
            return_document=ReturnDocument.AFTER,
        )

    async def remove_booking_reference(
        self,
        user_id: ObjectId,
        trip_id: str,
        booking_id: str,
    ) -> dict[str, Any] | None:
        return await self._collection.find_one_and_update(
            {"userId": user_id, "tripId": trip_id},
            {
                "$pull": {"bookingIds": booking_id},
                "$set": {"updatedAt": datetime.now(timezone.utc)},
            },
            return_document=ReturnDocument.AFTER,
        )
