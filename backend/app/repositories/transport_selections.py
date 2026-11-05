from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING, ReturnDocument
from pymongo.asynchronous.collection import AsyncCollection
from pymongo.asynchronous.database import AsyncDatabase


class SelectionNotFoundError(Exception):
    pass


class SelectionConflictError(Exception):
    pass


class TransportSelectionRepository:
    def __init__(self, database: AsyncDatabase) -> None:
        self._collection: AsyncCollection[dict[str, Any]] = database["transport_selection_attempts"]
        self._status_actions: AsyncCollection[dict[str, Any]] = database["booking_status_actions"]

    async def ensure_indexes(self) -> None:
        await self._collection.create_index(
            [("userId", ASCENDING), ("businessKey", ASCENDING)],
            unique=True,
            name="transport_selection_business_key_unique",
        )
        await self._collection.create_index(
            [("userId", ASCENDING), ("createdAt", DESCENDING)],
            name="transport_selection_user_created",
        )
        await self._collection.create_index(
            [("userId", ASCENDING), ("initBusinessKey", ASCENDING)],
            unique=True,
            partialFilterExpression={"initBusinessKey": {"$type": "string"}},
            name="transport_init_business_key_unique",
        )
        await self._collection.create_index(
            [("userId", ASCENDING), ("confirmBusinessKey", ASCENDING)],
            unique=True,
            partialFilterExpression={"confirmBusinessKey": {"$type": "string"}},
            name="transport_confirm_business_key_unique",
        )
        await self._collection.create_index(
            [("userId", ASCENDING), ("cancelBusinessKey", ASCENDING)],
            unique=True,
            partialFilterExpression={"cancelBusinessKey": {"$type": "string"}},
            name="transport_cancel_business_key_unique",
        )
        await self._collection.create_index(
            [("transactionId", ASCENDING), ("cancelMessageId", ASCENDING)],
            unique=True,
            partialFilterExpression={"cancelMessageId": {"$type": "string"}},
            name="transport_cancel_correlation_unique",
        )
        await self._collection.create_index(
            [("provider.id", ASCENDING), ("providerOrder.id", ASCENDING)],
            unique=True,
            partialFilterExpression={"providerOrder.id": {"$type": "string"}},
            name="transport_provider_order_unique",
        )
        await self._status_actions.create_index(
            [("transactionId", ASCENDING), ("messageId", ASCENDING)],
            unique=True,
            name="booking_status_correlation_unique",
        )
        await self._status_actions.create_index(
            [("userId", ASCENDING), ("createdAt", DESCENDING)],
            name="booking_status_user_created",
        )

    async def create_or_get(
        self,
        *,
        user_id: ObjectId,
        business_key: str,
        transaction_id: str,
        snapshot: dict[str, Any],
        quantity: int,
        message_id: str,
        kind: str = "transport",
        criteria: dict[str, Any] | None = None,
        display: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        existing = await self._collection.find_one({"userId": user_id, "businessKey": business_key})
        if existing:
            return existing
        now = datetime.now(timezone.utc)
        document = {
            "_id": ObjectId(),
            "selectionId": str(uuid4()),
            "userId": user_id,
            "businessKey": business_key,
            "kind": kind,
            "transactionId": transaction_id,
            "messageId": message_id,
            "provider": snapshot["provider"],
            "item": snapshot["item"],
            "fulfillment": snapshot["fulfillment"],
            "requestedQuantity": quantity,
            "snapshotPrice": snapshot["price"],
            "criteria": criteria or {},
            "bookingDisplay": display or {},
            "state": "SELECT_REQUESTED",
            "dispatching": False,
            "quote": None,
            "createdAt": now,
            "updatedAt": now,
        }
        try:
            await self._collection.insert_one(document)
        except Exception as error:
            # A unique-key race is resolved by returning the already-created attempt.
            if "duplicate" not in str(error).lower():
                raise
            existing = await self._collection.find_one({"userId": user_id, "businessKey": business_key})
            if existing is None:
                raise
            return existing
        return document

    async def claim_dispatch(self, selection_id: str, user_id: ObjectId) -> dict[str, Any] | None:
        return await self._collection.find_one_and_update(
            {
                "selectionId": selection_id,
                "userId": user_id,
                "state": "SELECT_REQUESTED",
                "dispatching": {"$ne": True},
            },
            {"$set": {"dispatching": True, "updatedAt": datetime.now(timezone.utc)}},
            return_document=ReturnDocument.AFTER,
        )

    async def update_result(
        self,
        *,
        selection_id: str,
        user_id: ObjectId,
        state: str,
        quote: dict[str, Any] | None,
        error: str | None = None,
        quote_expires_at: datetime | None = None,
        expected_states: list[str] | None = None,
    ) -> dict[str, Any] | None:
        fields: dict[str, Any] = {"state": state, "quote": quote, "error": error, "updatedAt": datetime.now(timezone.utc)}
        if quote_expires_at is not None:
            fields["quoteExpiresAt"] = quote_expires_at
        update = {"$set": fields}
        query: dict[str, Any] = {"selectionId": selection_id, "userId": user_id}
        if expected_states is not None:
            query["state"] = {"$in": expected_states}
        return await self._collection.find_one_and_update(
            query,
            update,
            return_document=ReturnDocument.AFTER,
        )

    async def get_for_user(self, selection_id: str, user_id: ObjectId) -> dict[str, Any] | None:
        return await self._collection.find_one({"selectionId": selection_id, "userId": user_id})

    async def get_many_for_user(
        self,
        *,
        user_id: ObjectId,
        selection_ids: list[str],
    ) -> list[dict[str, Any]]:
        if not selection_ids:
            return []
        cursor = self._collection.find({
            "userId": user_id,
            "selectionId": {"$in": selection_ids},
        })
        return await cursor.to_list(length=len(selection_ids))

    async def list_for_user(self, user_id: ObjectId, limit: int = 50) -> list[dict[str, Any]]:
        cursor = self._collection.find({"userId": user_id}).sort("createdAt", DESCENDING).limit(limit)
        return await cursor.to_list(length=limit)

    async def get_for_callback(self, transaction_id: str, message_id: str) -> dict[str, Any] | None:
        return await self._collection.find_one({
            "$or": [
                {"transactionId": transaction_id, "messageId": message_id},
                {"transactionId": transaction_id, "initMessageId": message_id},
                {"transactionId": transaction_id, "confirmMessageId": message_id},
                {"transactionId": transaction_id, "cancelMessageId": message_id},
            ],
        })

    async def begin_status(
        self,
        *,
        attempt: dict[str, Any],
        user_id: ObjectId,
        message_id: str,
    ) -> dict[str, Any] | None:
        now = datetime.now(timezone.utc)
        recent_count = await self._status_actions.count_documents({
            "userId": user_id,
            "createdAt": {"$gte": now - timedelta(minutes=1)},
        })
        if recent_count >= 10:
            raise SelectionConflictError("Status refresh limit reached; wait before checking again.")
        if not isinstance(attempt.get("providerOrder", {}).get("id"), str):
            return None

        action = {
            "transactionId": attempt["transactionId"],
            "messageId": message_id,
            "selectionId": attempt["selectionId"],
            "userId": user_id,
            "providerId": attempt["provider"]["id"],
            "orderId": attempt["providerOrder"]["id"],
            "state": "STATUS_REQUESTED",
            "dispatching": False,
            "createdAt": now,
            "updatedAt": now,
        }
        await self._status_actions.insert_one(action)
        updated = await self._collection.find_one_and_update(
            {
                "selectionId": attempt["selectionId"],
                "userId": user_id,
                "transactionId": attempt["transactionId"],
                "provider.id": attempt["provider"]["id"],
                "providerOrder.id": attempt["providerOrder"]["id"],
            },
            {"$set": {
                "latestStatusMessageId": message_id,
                "latestStatusRequestedAt": now,
                "updatedAt": now,
            }},
            return_document=ReturnDocument.AFTER,
        )
        if updated is None:
            await self._status_actions.update_one(
                {"transactionId": attempt["transactionId"], "messageId": message_id},
                {"$set": {"state": "STATUS_REJECTED", "updatedAt": datetime.now(timezone.utc)}},
            )
            return None
        return {**action, "attempt": updated}

    async def claim_status_dispatch(self, transaction_id: str, message_id: str) -> dict[str, Any] | None:
        return await self._status_actions.find_one_and_update(
            {
                "transactionId": transaction_id,
                "messageId": message_id,
                "state": "STATUS_REQUESTED",
                "dispatching": {"$ne": True},
            },
            {"$set": {"dispatching": True, "updatedAt": datetime.now(timezone.utc)}},
            return_document=ReturnDocument.AFTER,
        )

    async def get_status_for_callback(
        self,
        transaction_id: str,
        message_id: str,
    ) -> tuple[dict[str, Any], dict[str, Any]] | None:
        action = await self._status_actions.find_one({
            "transactionId": transaction_id,
            "messageId": message_id,
        })
        if action is None:
            return None
        attempt = await self._collection.find_one({
            "selectionId": action["selectionId"],
            "userId": action["userId"],
            "transactionId": transaction_id,
        })
        if attempt is None:
            return None
        return attempt, action

    async def get_status_action(self, transaction_id: str, message_id: str) -> dict[str, Any] | None:
        return await self._status_actions.find_one({
            "transactionId": transaction_id,
            "messageId": message_id,
        })

    async def update_status_action(
        self,
        *,
        transaction_id: str,
        message_id: str,
        state: str,
        response: dict[str, Any] | None = None,
        error: str | None = None,
        expected_states: list[str] | None = None,
    ) -> dict[str, Any] | None:
        fields: dict[str, Any] = {
            "state": state,
            "error": error,
            "updatedAt": datetime.now(timezone.utc),
        }
        if response is not None:
            fields["response"] = response
        query: dict[str, Any] = {
            "transactionId": transaction_id,
            "messageId": message_id,
        }
        if expected_states is not None:
            query["state"] = {"$in": expected_states}
        return await self._status_actions.find_one_and_update(
            query,
            {"$set": fields},
            return_document=ReturnDocument.AFTER,
        )

    async def update_latest_status(
        self,
        *,
        selection_id: str,
        user_id: ObjectId,
        message_id: str,
        response: dict[str, Any],
    ) -> dict[str, Any] | None:
        return await self._collection.find_one_and_update(
            {
                "selectionId": selection_id,
                "userId": user_id,
                "latestStatusMessageId": message_id,
            },
            {"$set": {
                "latestProviderStatus": response,
                "latestStatusReceivedAt": datetime.now(timezone.utc),
                "updatedAt": datetime.now(timezone.utc),
            }},
            return_document=ReturnDocument.AFTER,
        )

    async def begin_init(
        self,
        *,
        selection_id: str,
        user_id: ObjectId,
        business_key: str,
        message_id: str,
        traveller_count: int,
        details: dict[str, Any],
    ) -> dict[str, Any] | None:
        existing = await self._collection.find_one({
            "selectionId": selection_id,
            "userId": user_id,
            "initBusinessKey": business_key,
        })
        if existing is not None:
            return existing
        now = datetime.now(timezone.utc)
        created = await self._collection.find_one_and_update(
            {
                "selectionId": selection_id,
                "userId": user_id,
                "state": "SELECTED",
                "quoteExpiresAt": {"$gt": now},
                "$or": [
                    {"initBusinessKey": {"$exists": False}},
                ],
            },
            {"$set": {
                "initBusinessKey": business_key,
                "initMessageId": message_id,
                "initTravellerCount": traveller_count,
                "initDetails": details,
                "initState": "INIT_REQUESTED",
                "initDispatching": False,
                "updatedAt": now,
            }},
            return_document=ReturnDocument.AFTER,
        )
        if created is not None:
            return created
        return await self._collection.find_one({
            "selectionId": selection_id,
            "userId": user_id,
            "initBusinessKey": business_key,
        })

    async def reset_initialized_for_reinit(
        self,
        selection_id: str,
        user_id: ObjectId,
    ) -> dict[str, Any] | None:
        now = datetime.now(timezone.utc)
        previous = await self._collection.find_one({
            "selectionId": selection_id,
            "userId": user_id,
            "state": "INITIALIZED",
        })
        if previous is None:
            return None
        return await self._collection.find_one_and_update(
            {
                "selectionId": selection_id,
                "userId": user_id,
                "state": "INITIALIZED",
                "confirmState": {"$nin": ["CONFIRMED", "CONFIRM_REQUESTED", "PENDING_PROVIDER"]},
            },
            {
                "$set": {"state": "SELECTED", "updatedAt": now},
                "$unset": {
                    "initBusinessKey": "", "initMessageId": "", "initTravellerCount": "",
                    "initDetails": "", "initState": "", "providerOrder": "",
                    "providerOrderExpiresAt": "", "priceChanged": "",
                    "confirmBusinessKey": "", "confirmMessageId": "", "confirmDispatching": "",
                    "acceptedQuote": "", "confirmState": "", "confirmError": "",
                },
                "$push": {
                    "initActionHistory": {
                        "messageId": previous.get("initMessageId"),
                        "providerOrderId": (previous.get("providerOrder") or {}).get("id"),
                        "state": "REPLACED",
                        "recordedAt": now,
                    },
                },
            },
            return_document=ReturnDocument.AFTER,
        )

    async def claim_init_dispatch(self, selection_id: str, user_id: ObjectId) -> dict[str, Any] | None:
        return await self._collection.find_one_and_update(
            {
                "selectionId": selection_id,
                "userId": user_id,
                "initState": "INIT_REQUESTED",
                "initDispatching": {"$ne": True},
            },
            {"$set": {"initDispatching": True, "updatedAt": datetime.now(timezone.utc)}},
            return_document=ReturnDocument.AFTER,
        )

    async def update_init(
        self,
        *,
        selection_id: str,
        user_id: ObjectId,
        state: str,
        order: dict[str, Any] | None = None,
        details: dict[str, Any] | None = None,
        error: str | None = None,
        price_changed: bool = False,
        order_expires_at: datetime | None = None,
        expected_states: list[str] | None = None,
    ) -> dict[str, Any] | None:
        fields: dict[str, Any] = {
            "initState": state,
            "providerOrder": order,
            "initError": error,
            "priceChanged": price_changed,
            "updatedAt": datetime.now(timezone.utc),
        }
        if state == "INITIALIZED":
            fields["state"] = "INITIALIZED"
            if order_expires_at is not None:
                fields["providerOrderExpiresAt"] = order_expires_at
        if details is not None:
            fields["initDetails"] = details
        query: dict[str, Any] = {"selectionId": selection_id, "userId": user_id}
        if expected_states is not None:
            query["initState"] = {"$in": expected_states}
        return await self._collection.find_one_and_update(
            query,
            {"$set": fields},
            return_document=ReturnDocument.AFTER,
        )

    async def begin_confirm(
        self,
        *,
        selection_id: str,
        user_id: ObjectId,
        business_key: str,
        message_id: str,
        accepted_quote: dict[str, str],
    ) -> dict[str, Any] | None:
        existing = await self._collection.find_one({
            "selectionId": selection_id,
            "userId": user_id,
            "confirmBusinessKey": business_key,
        })
        if existing is not None:
            return existing
        now = datetime.now(timezone.utc)
        created = await self._collection.find_one_and_update(
            {
                "selectionId": selection_id,
                "userId": user_id,
                "state": "INITIALIZED",
                "initState": "INITIALIZED",
                "providerOrderExpiresAt": {"$gt": now},
                "confirmBusinessKey": {"$exists": False},
            },
            {"$set": {
                "confirmBusinessKey": business_key,
                "confirmMessageId": message_id,
                "acceptedQuote": accepted_quote,
                "confirmState": "CONFIRM_REQUESTED",
                "confirmDispatching": False,
                "updatedAt": now,
            }},
            return_document=ReturnDocument.AFTER,
        )
        if created is not None:
            return created
        return await self._collection.find_one({
            "selectionId": selection_id,
            "userId": user_id,
            "confirmBusinessKey": business_key,
        })

    async def claim_confirm_dispatch(self, selection_id: str, user_id: ObjectId) -> dict[str, Any] | None:
        return await self._collection.find_one_and_update(
            {
                "selectionId": selection_id,
                "userId": user_id,
                "confirmState": "CONFIRM_REQUESTED",
                "confirmDispatching": {"$ne": True},
            },
            {"$set": {
                "confirmDispatching": True,
                "updatedAt": datetime.now(timezone.utc),
            }},
            return_document=ReturnDocument.AFTER,
        )

    async def update_confirm(
        self,
        *,
        selection_id: str,
        user_id: ObjectId,
        state: str,
        response: dict[str, Any] | None = None,
        error: str | None = None,
        expected_states: list[str] | None = None,
        source: str = "ON_CONFIRM",
    ) -> dict[str, Any] | None:
        fields: dict[str, Any] = {
            "confirmState": state,
            "confirmError": error,
            "updatedAt": datetime.now(timezone.utc),
        }
        if response is not None:
            fields["confirmedProviderResponse"] = response
        if state == "CONFIRMED":
            fields["state"] = "CONFIRMED"
            fields["confirmSource"] = source
        query: dict[str, Any] = {"selectionId": selection_id, "userId": user_id}
        if expected_states is not None:
            query["confirmState"] = {"$in": expected_states}
        return await self._collection.find_one_and_update(
            query,
            {"$set": fields},
            return_document=ReturnDocument.AFTER,
        )

    async def begin_cancel(
        self,
        *,
        selection_id: str,
        user_id: ObjectId,
        business_key: str,
        message_id: str,
        reason: str,
    ) -> dict[str, Any] | None:
        existing = await self._collection.find_one({
            "selectionId": selection_id,
            "userId": user_id,
            "cancelBusinessKey": business_key,
        })
        if existing is not None:
            return existing
        now = datetime.now(timezone.utc)
        created = await self._collection.find_one_and_update(
            {
                "selectionId": selection_id,
                "userId": user_id,
                "state": "CONFIRMED",
                "confirmState": "CONFIRMED",
                "cancelBusinessKey": {"$exists": False},
            },
            {"$set": {
                "cancelBusinessKey": business_key,
                "cancelMessageId": message_id,
                "cancelReason": reason,
                "cancelState": "CANCEL_REQUESTED",
                "cancelDispatching": False,
                "updatedAt": now,
            }},
            return_document=ReturnDocument.AFTER,
        )
        if created is not None:
            return created
        return await self._collection.find_one({
            "selectionId": selection_id,
            "userId": user_id,
            "cancelBusinessKey": business_key,
        })

    async def claim_cancel_dispatch(self, selection_id: str, user_id: ObjectId) -> dict[str, Any] | None:
        return await self._collection.find_one_and_update(
            {
                "selectionId": selection_id,
                "userId": user_id,
                "cancelState": "CANCEL_REQUESTED",
                "cancelDispatching": {"$ne": True},
            },
            {"$set": {
                "cancelDispatching": True,
                "updatedAt": datetime.now(timezone.utc),
            }},
            return_document=ReturnDocument.AFTER,
        )

    async def update_cancel(
        self,
        *,
        selection_id: str,
        user_id: ObjectId,
        state: str,
        response: dict[str, Any] | None = None,
        error: str | None = None,
        expected_states: list[str] | None = None,
        source: str = "ON_CANCEL",
    ) -> dict[str, Any] | None:
        now = datetime.now(timezone.utc)
        fields: dict[str, Any] = {
            "cancelState": state,
            "cancelError": error,
            "updatedAt": now,
        }
        if response is not None and state == "CANCELLED":
            fields["cancelledProviderResponse"] = response
        elif response is not None:
            fields["cancelProviderResponse"] = response
        if state == "CANCELLED":
            fields["state"] = "CANCELLED"
            fields["cancelSource"] = source
        query: dict[str, Any] = {"selectionId": selection_id, "userId": user_id}
        if expected_states is not None:
            query["cancelState"] = {"$in": expected_states}
        return await self._collection.find_one_and_update(
            query,
            {"$set": fields},
            return_document=ReturnDocument.AFTER,
        )

    async def hide_booking(self, selection_id: str, user_id: ObjectId) -> dict[str, Any] | None:
        """Hide a cancelled booking from My Bookings (mark as hidden, don't delete)."""
        return await self._collection.find_one_and_update(
            {
                "selectionId": selection_id,
                "userId": user_id,
                "confirmState": "CONFIRMED",
                "cancelState": "CANCELLED",
                "hidden": {"$ne": True},
            },
            {"$set": {"hidden": True, "hiddenAt": datetime.now(timezone.utc), "updatedAt": datetime.now(timezone.utc)}},
            return_document=ReturnDocument.AFTER,
        )
