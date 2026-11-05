from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from copy import deepcopy
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from threading import RLock
from typing import Any

from bson.decimal128 import Decimal128
from pymongo import ASCENDING, MongoClient
from pymongo.errors import DuplicateKeyError


BUS_BPP_ID = "mock-bus.example.in"
BUS_PROVIDER_ID = "mock-bus"
PROVIDER_IDENTITIES = {
    BUS_BPP_ID: "mock-bus",
    "mock-train.example.in": "mock-train",
    "mock-flight.example.in": "mock-flight",
    "mock-hotel.example.in": "mock-hotel",
    "mock-experience.example.in": "mock-experience",
}
_CLIENT_LOCK = RLock()
_CLIENTS: dict[tuple[str, str], "MongoProviderStore"] = {}


class MongoStorageConfigurationError(RuntimeError):
    pass


class MongoTransactionsUnsupported(RuntimeError):
    pass


class _AbortTransaction(Exception):
    def __init__(self, result: str):
        self.result = result


def _decimal(value: Any) -> Decimal:
    if isinstance(value, Decimal128):
        return value.to_decimal()
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def provider_to_mongo_document(provider: dict[str, Any]) -> dict[str, Any]:
    bpp_id = provider.get("bpp_id")
    if not isinstance(bpp_id, str) or not bpp_id:
        raise MongoStorageConfigurationError("Provider BPP identity is required.")
    return {"_id": bpp_id, "provider": deepcopy(provider)}


def service_to_mongo_document(provider_bpp_id: str, service: dict[str, Any]) -> dict[str, Any]:
    service_id = service.get("service_id")
    price = service.get("price")
    if not isinstance(service_id, str) or not service_id or not isinstance(price, dict):
        raise MongoStorageConfigurationError("Provider service identity or price is invalid.")
    try:
        amount = _decimal(price["amount"])
        if not amount.is_finite() or amount < 0:
            raise ValueError
        mongo_amount = Decimal128(amount)
    except (KeyError, InvalidOperation, TypeError, ValueError) as error:
        raise MongoStorageConfigurationError("Provider service price cannot be represented as Decimal128.") from error
    document = deepcopy(service)
    document["price"]["amount"] = mongo_amount
    return {
        "_id": service_id,
        "providerBppId": provider_bpp_id,
        **document,
    }


def _json_hash(value: dict[str, Any]) -> str:
    stable = json.loads(json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False))
    stable["tags"] = [
        tag for tag in stable.get("tags", [])
        if tag.get("descriptor", {}).get("code") != "TDE_PROVIDER_CONFIRMATION"
    ]
    if isinstance(stable.get("cancellation"), dict):
        stable["cancellation"].pop("time", None)
    stable.pop("updated_at", None)
    encoded = json.dumps(stable, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _configuration() -> tuple[str, str]:
    uri = os.getenv("PROVIDER_MONGO_URL")
    database_name = os.getenv("PROVIDER_DB_NAME")
    if not uri or not database_name:
        raise MongoStorageConfigurationError(
            "Mongo provider storage requires PROVIDER_MONGO_URL and PROVIDER_DB_NAME."
        )
    return uri, database_name


class MongoProviderStore:
    def __init__(
        self,
        uri: str,
        database_name: str,
        provider_bpp_id: str = BUS_BPP_ID,
        provider_id: str = BUS_PROVIDER_ID,
    ):
        self._client = MongoClient(
            uri,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=5000,
            retryWrites=True,
        )
        self.database = self._client[database_name]
        self.providers = self.database["providers"]
        self.services = self.database["services"]
        self.inventory = self.database["inventory"]
        self.orders = self.database["provider_orders"]
        self.actions = self.database["provider_actions"]
        self.warnings = self.database["provider_migration_warnings"]
        self.provider_bpp_id = provider_bpp_id
        self.provider_id = provider_id
        self._transactions_verified = False

    def close(self) -> None:
        self._client.close()

    def verify_transactions(self) -> None:
        self._client.admin.command("ping")
        hello = self._client.admin.command("hello")
        if not hello.get("setName") and hello.get("msg") != "isdbgrid":
            raise MongoTransactionsUnsupported(
                "Mongo provider storage requires a replica set or sharded deployment."
            )
        with self._client.start_session() as session:
            session.start_transaction()
            try:
                self.orders.find_one({"_id": "__read_only_transaction_probe__"}, session=session)
            finally:
                if session.in_transaction:
                    session.abort_transaction()
        self._transactions_verified = True

    def ensure_indexes(self) -> None:
        self.services.create_index(
            [("providerBppId", ASCENDING), ("service_id", ASCENDING)],
            unique=True,
            name="bus_service_identity_unique",
        )
        self.services.create_index(
            [
                ("providerBppId", ASCENDING),
                ("from.city", ASCENDING),
                ("to.city", ASCENDING),
            ],
            name="bus_service_route",
        )
        inventory_index_name = "provider_inventory_identity_unique"
        existing_indexes = {
            index["name"]: index
            for index in self.inventory.list_indexes()
        }
        existing_inventory_index = existing_indexes.get(inventory_index_name)
        expected_inventory_key = [
            ("providerBppId", ASCENDING),
            ("serviceId", ASCENDING),
            ("serviceDate", ASCENDING),
            ("slot", ASCENDING),
        ]
        if existing_inventory_index is not None and list(existing_inventory_index["key"].items()) != expected_inventory_key:
            self.inventory.drop_index(inventory_index_name)
        self.inventory.create_index(
            expected_inventory_key,
            unique=True,
            name=inventory_index_name,
        )
        self.orders.create_index(
            [("providerBppId", ASCENDING), ("transactionId", ASCENDING), ("initMessageId", ASCENDING)],
            unique=True,
            name="provider_order_init_unique",
        )
        self.orders.create_index(
            [("providerBppId", ASCENDING), ("transactionId", ASCENDING), ("bapId", ASCENDING)],
            name="provider_order_owner",
        )
        self.actions.create_index(
            [
                ("providerBppId", ASCENDING),
                ("transactionId", ASCENDING),
                ("bapId", ASCENDING),
                ("action", ASCENDING),
                ("messageId", ASCENDING),
            ],
            unique=True,
            name="provider_action_correlation_unique",
        )
        self.warnings.create_index(
            [("migrationId", ASCENDING), ("recordLabel", ASCENDING), ("issue", ASCENDING)],
            unique=True,
            name="provider_migration_warning_unique",
        )

    def record_migration_warnings(
        self,
        migration_id: str,
        source_hash: str,
        warnings: list[dict[str, str]],
    ) -> None:
        if not migration_id or not source_hash:
            raise ValueError("Migration ID and source hash are required.")
        for warning in warnings:
            label = warning.get("recordLabel")
            issue = warning.get("issue")
            order_id = warning.get("orderId")
            if not label or not issue or not order_id:
                raise ValueError("Migration warnings require an anonymous record label, order identity and issue.")
            document = {
                "migrationId": migration_id,
                "recordLabel": label,
                "issue": issue,
                "providerBppId": self.provider_bpp_id,
                "providerOrderId": order_id,
                "sourceHash": source_hash,
                "historicalUnsafe": True,
                "mutationBlocked": True,
                "createdAt": _now(),
            }
            self.warnings.update_one(
                {"migrationId": migration_id, "recordLabel": label, "issue": issue},
                {"$setOnInsert": document},
                upsert=True,
            )
            stored = self.warnings.find_one({
                "migrationId": migration_id,
                "recordLabel": label,
                "issue": issue,
            })
            if stored is None or any(stored.get(key) != document[key] for key in (
                "providerOrderId", "providerBppId", "sourceHash",
                "historicalUnsafe", "mutationBlocked"
            )):
                raise MongoStorageConfigurationError("Migration warning conflicts with an existing record.")

    def load_catalog(self, provider_bpp_id: str) -> dict[str, Any]:
        if provider_bpp_id != self.provider_bpp_id:
            raise MongoStorageConfigurationError("Mongo storage provider identity does not match.")
        provider_doc = self.providers.find_one({"_id": provider_bpp_id})
        if provider_doc is None:
            raise MongoStorageConfigurationError("BusProvider catalog is unavailable in Mongo storage.")
        provider = provider_doc.get("provider")
        if (
            not isinstance(provider, dict)
            or provider.get("bpp_id") != provider_bpp_id
            or provider.get("id") != self.provider_id
        ):
            raise MongoStorageConfigurationError("BusProvider catalog identity is invalid.")

        services: list[dict[str, Any]] = []
        cursor = self.services.find({"providerBppId": provider_bpp_id}).sort("service_id", ASCENDING)
        for document in cursor:
            service = {
                key: value
                for key, value in document.items()
                if key not in {"_id", "providerBppId"}
            }
            if service.get("service_id") != document.get("_id"):
                raise MongoStorageConfigurationError("Bus service identity does not match its catalog ID.")
            price = service.get("price")
            if not isinstance(price, dict) or "amount" not in price:
                raise MongoStorageConfigurationError("Bus service price is missing.")
            try:
                price["amount"] = _decimal(price["amount"])
                if not price["amount"].is_finite() or price["amount"] < 0:
                    raise ValueError
            except (InvalidOperation, TypeError, ValueError) as error:
                raise MongoStorageConfigurationError("Bus service price is invalid.") from error
            services.append(service)
        if not services:
            raise MongoStorageConfigurationError("BusProvider catalog has no services.")
        return {"provider": provider, "services": services}

    def get_inventory_available(
        self,
        provider_id: str,
        resource_key: str,
        initial_capacity: int,
    ) -> int:
        service_id, service_date = _parse_inventory_key(resource_key)
        if not isinstance(initial_capacity, int) or isinstance(initial_capacity, bool) or initial_capacity < 0:
            raise ValueError("Initial inventory capacity must be a non-negative integer.")
        self.inventory.update_one(
            {"_id": resource_key},
            {
                "$setOnInsert": {
                    "providerBppId": provider_id,
                    "serviceId": service_id,
                    "serviceDate": service_date,
                    "available": initial_capacity,
                    "initialCapacity": initial_capacity,
                }
            },
            upsert=True,
        )
        record = self.inventory.find_one({"_id": resource_key, "providerBppId": provider_id})
        if record is None:
            raise MongoStorageConfigurationError("Provider inventory identity does not match.")
        if (
            record.get("serviceId") != service_id
            or record.get("serviceDate") != service_date
            or record.get("initialCapacity") != initial_capacity
        ):
            raise MongoStorageConfigurationError("Provider inventory capacity or identity conflicts with the catalog.")
        available = record.get("available")
        if (
            not isinstance(available, int)
            or isinstance(available, bool)
            or available < 0
            or available > initial_capacity
        ):
            raise MongoStorageConfigurationError("Provider inventory balance is invalid.")
        return available

    def save_initialized_order(
        self,
        provider_id: str,
        transaction_id: str,
        message_id: str,
        order: dict[str, Any],
        bap_id: str,
    ) -> None:
        document = {
            "_id": order["id"],
            "providerBppId": provider_id,
            "providerId": order.get("provider", {}).get("id"),
            "transactionId": transaction_id,
            "initMessageId": message_id,
            "bapId": bap_id,
            "state": "INITIALIZED",
            "order": order,
            "confirmMessageId": None,
            "cancelMessageId": None,
            "inventoryAllocations": None,
            "mutationBlocked": False,
            "historicalUnsafe": False,
        }
        try:
            self.orders.update_one(
                {
                    "providerBppId": provider_id,
                    "transactionId": transaction_id,
                    "initMessageId": message_id,
                },
                {"$setOnInsert": document},
                upsert=True,
            )
        except DuplicateKeyError:
            pass
        stored = self.orders.find_one({
            "providerBppId": provider_id,
            "transactionId": transaction_id,
            "initMessageId": message_id,
        })
        if (
            stored is None
            or stored.get("_id") != order["id"]
            or stored.get("bapId") != bap_id
            or stored.get("order") != order
        ):
            raise sqlite3.IntegrityError("Provider order identity conflicts with an existing order.")

    def get_order(self, provider_id: str, order_id: str) -> dict[str, Any] | None:
        record = self.orders.find_one({"_id": order_id, "providerBppId": provider_id})
        return record.get("order") if record else None

    def get_initialized_order(self, provider_id: str, order_id: str) -> dict[str, Any] | None:
        record = self.orders.find_one({
            "_id": order_id,
            "providerBppId": provider_id,
            "state": "INITIALIZED",
        })
        return record.get("order") if record else None

    def get_order_owner(self, provider_id: str, order_id: str) -> tuple[str, str, str] | None:
        record = self.orders.find_one(
            {"_id": order_id, "providerBppId": provider_id},
            {"transactionId": 1, "bapId": 1, "state": 1},
        )
        if record is None:
            return None
        return record.get("transactionId", ""), record.get("bapId", ""), record.get("state", "")

    def confirm_provider_order(
        self,
        *,
        provider_id: str,
        order_id: str,
        transaction_id: str,
        bap_id: str,
        message_id: str,
        order: dict[str, Any],
        requirements: list[tuple[str, int, int]],
    ) -> tuple[str, dict[str, Any] | None]:
        if not self._transactions_verified:
            self.verify_transactions()
        request_hash = _json_hash(order)
        try:
            def operation(session):
                existing_action = self._find_action(
                    provider_id, transaction_id, bap_id, "confirm", message_id, session
                )
                if existing_action:
                    if existing_action.get("requestHash") != request_hash:
                        raise _AbortTransaction("IDEMPOTENCY_CONFLICT")
                    return existing_action.get("result", "CONFIRMED"), existing_action.get("order")

                record = self.orders.find_one(
                    {"_id": order_id, "providerBppId": provider_id},
                    session=session,
                )
                if not _owns(record, transaction_id, bap_id):
                    raise _AbortTransaction("NOT_FOUND")
                if self._is_mutation_blocked(record, session):
                    raise _AbortTransaction("UNSAFE_HISTORICAL")
                if record["state"] == "CONFIRMED":
                    saved_order = record["order"]
                    self._save_action(
                        provider_id, transaction_id, bap_id, "confirm", message_id,
                        request_hash, "CONFIRMED", saved_order, session,
                    )
                    return "CONFIRMED", saved_order
                if record["state"] != "INITIALIZED":
                    raise _AbortTransaction("NOT_INITIALIZED")
                _validate_requirements(requirements)
                for resource_key, quantity, _ in requirements:
                    inventory = self.inventory.find_one(
                        {"_id": resource_key, "providerBppId": provider_id},
                        session=session,
                    )
                    if inventory is None or inventory.get("available", 0) < quantity:
                        raise _AbortTransaction("UNAVAILABLE")
                for resource_key, quantity, _ in requirements:
                    updated = self.inventory.update_one(
                        {
                            "_id": resource_key,
                            "providerBppId": provider_id,
                            "available": {"$gte": quantity},
                        },
                        {"$inc": {"available": -quantity}, "$set": {"updatedAt": _now()}},
                        session=session,
                    )
                    if updated.modified_count != 1:
                        raise _AbortTransaction("UNAVAILABLE")
                allocations = [
                    {
                        "resourceKey": key,
                        "quantity": quantity,
                        "initialCapacity": initial_capacity,
                    }
                    for key, quantity, initial_capacity in requirements
                ]
                result = self.orders.update_one(
                    {
                        "_id": order_id,
                        "providerBppId": provider_id,
                        "transactionId": transaction_id,
                        "bapId": bap_id,
                        "state": "INITIALIZED",
                        "mutationBlocked": {"$ne": True},
                    },
                    {
                        "$set": {
                            "state": "CONFIRMED",
                            "order": order,
                            "confirmMessageId": message_id,
                            "inventoryAllocations": allocations,
                            "updatedAt": _now(),
                        }
                    },
                    session=session,
                )
                if result.modified_count != 1:
                    raise _AbortTransaction("NOT_INITIALIZED")
                self._save_action(
                    provider_id, transaction_id, bap_id, "confirm", message_id,
                    request_hash, "CONFIRMED", order, session,
                )
                return "CONFIRMED", order

            with self._client.start_session() as session:
                return session.with_transaction(operation)
        except _AbortTransaction as abort:
            return abort.result, None
        except DuplicateKeyError:
            return self._resolve_duplicate_action(
                provider_id, transaction_id, bap_id, "confirm", message_id, request_hash
            )

    def cancel_provider_order(
        self,
        *,
        provider_id: str,
        order_id: str,
        transaction_id: str,
        bap_id: str,
        message_id: str,
        cancelled_order: dict[str, Any],
    ) -> tuple[str, dict[str, Any] | None]:
        if not self._transactions_verified:
            self.verify_transactions()
        request_hash = _json_hash(cancelled_order)
        try:
            def operation(session):
                existing_action = self._find_action(
                    provider_id, transaction_id, bap_id, "cancel", message_id, session
                )
                if existing_action:
                    if existing_action.get("requestHash") != request_hash:
                        raise _AbortTransaction("IDEMPOTENCY_CONFLICT")
                    return existing_action.get("result", "CANCELLED"), existing_action.get("order")

                record = self.orders.find_one(
                    {"_id": order_id, "providerBppId": provider_id},
                    session=session,
                )
                if not _owns(record, transaction_id, bap_id):
                    raise _AbortTransaction("NOT_FOUND")
                if self._is_mutation_blocked(record, session):
                    raise _AbortTransaction("UNSAFE_HISTORICAL")
                if record["state"] == "CANCELLED":
                    saved_order = record["order"]
                    self._save_action(
                        provider_id, transaction_id, bap_id, "cancel", message_id,
                        request_hash, "CANCELLED", saved_order, session,
                    )
                    return "CANCELLED", saved_order
                if record["state"] != "CONFIRMED":
                    raise _AbortTransaction("NOT_CONFIRMED")
                allocations = record.get("inventoryAllocations")
                if not isinstance(allocations, list) or not allocations:
                    raise _AbortTransaction("ALLOCATION_MISSING")
                for allocation in allocations:
                    _validate_allocation(allocation)
                    updated = self.inventory.update_one(
                        {
                            "_id": allocation["resourceKey"],
                            "providerBppId": provider_id,
                            "available": {
                                "$lte": allocation["initialCapacity"] - allocation["quantity"]
                            },
                            "initialCapacity": allocation["initialCapacity"],
                        },
                        {
                            "$inc": {"available": allocation["quantity"]},
                            "$set": {"updatedAt": _now()},
                        },
                        session=session,
                    )
                    if updated.modified_count != 1:
                        raise _AbortTransaction("ALLOCATION_INVALID")
                result = self.orders.update_one(
                    {
                        "_id": order_id,
                        "providerBppId": provider_id,
                        "transactionId": transaction_id,
                        "bapId": bap_id,
                        "state": "CONFIRMED",
                        "mutationBlocked": {"$ne": True},
                    },
                    {
                        "$set": {
                            "state": "CANCELLED",
                            "order": cancelled_order,
                            "cancelMessageId": message_id,
                            "updatedAt": _now(),
                        }
                    },
                    session=session,
                )
                if result.modified_count != 1:
                    raise _AbortTransaction("NOT_CONFIRMED")
                self._save_action(
                    provider_id, transaction_id, bap_id, "cancel", message_id,
                    request_hash, "CANCELLED", cancelled_order, session,
                )
                return "CANCELLED", cancelled_order

            with self._client.start_session() as session:
                return session.with_transaction(operation)
        except _AbortTransaction as abort:
            return abort.result, None
        except DuplicateKeyError:
            return self._resolve_duplicate_action(
                provider_id, transaction_id, bap_id, "cancel", message_id, request_hash
            )

    def _find_action(self, provider_id, transaction_id, bap_id, action, message_id, session):
        return self.actions.find_one(
            {
                "providerBppId": provider_id,
                "transactionId": transaction_id,
                "bapId": bap_id,
                "action": action,
                "messageId": message_id,
            },
            session=session,
        )

    def _is_mutation_blocked(self, record, session) -> bool:
        if record.get("mutationBlocked") is True or record.get("historicalUnsafe") is True:
            return True
        return self.warnings.find_one(
            {
                "providerBppId": record.get("providerBppId"),
                "providerOrderId": record.get("_id"),
                "mutationBlocked": True,
            },
            {"_id": 1},
            session=session,
        ) is not None

    def _save_action(
        self,
        provider_id,
        transaction_id,
        bap_id,
        action,
        message_id,
        request_hash,
        result,
        order,
        session,
    ):
        self.actions.insert_one(
            {
                "providerBppId": provider_id,
                "transactionId": transaction_id,
                "bapId": bap_id,
                "action": action,
                "messageId": message_id,
                "requestHash": request_hash,
                "result": result,
                "order": order,
                "createdAt": _now(),
            },
            session=session,
        )

    def _resolve_duplicate_action(self, provider_id, transaction_id, bap_id, action, message_id, request_hash):
        existing = self.actions.find_one({
            "providerBppId": provider_id,
            "transactionId": transaction_id,
            "bapId": bap_id,
            "action": action,
            "messageId": message_id,
        })
        if existing is None:
            raise MongoStorageConfigurationError("Provider action conflict could not be resolved safely.")
        if existing.get("requestHash") != request_hash:
            return "IDEMPOTENCY_CONFLICT", None
        return existing.get("result", "NOT_FOUND"), existing.get("order")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _owns(record: dict[str, Any] | None, transaction_id: str, bap_id: str) -> bool:
    return bool(
        record
        and record.get("transactionId") == transaction_id
        and record.get("bapId")
        and record.get("bapId") == bap_id
    )


def _parse_inventory_key(resource_key: str) -> tuple[str, str]:
    parts = resource_key.split(":")
    if len(parts) < 3 or parts[0] not in {"transport", "hotel", "experience"}:
        raise ValueError("Provider inventory key has an unsupported category.")
    date_part = parts[-1] if parts[0] == "hotel" else parts[2]
    try:
        service_date = date.fromisoformat(date_part).isoformat()
    except ValueError as error:
        raise ValueError("Provider inventory key has an invalid service date.") from error
    return ":".join(parts[1:-1] if parts[0] == "hotel" else parts[1:2]), service_date


def _validate_requirements(requirements: list[tuple[str, int, int]]) -> None:
    if not requirements:
        raise ValueError("Confirmation requires at least one inventory allocation.")
    seen: set[str] = set()
    for resource_key, quantity, capacity in requirements:
        _parse_inventory_key(resource_key)
        if resource_key in seen:
            raise ValueError("Duplicate inventory resources must be consolidated.")
        seen.add(resource_key)
        if any(not isinstance(value, int) or isinstance(value, bool) for value in (quantity, capacity)):
            raise ValueError("Inventory quantities and capacities must be integers.")
        if quantity < 1 or capacity < quantity:
            raise ValueError("Inventory requirement is invalid.")


def _validate_allocation(allocation: dict[str, Any]) -> None:
    key = allocation.get("resourceKey")
    quantity = allocation.get("quantity")
    capacity = allocation.get("initialCapacity")
    if not isinstance(key, str):
        raise _AbortTransaction("ALLOCATION_INVALID")
    try:
        _parse_inventory_key(key)
    except ValueError:
        raise _AbortTransaction("ALLOCATION_INVALID") from None
    if (
        not isinstance(quantity, int)
        or isinstance(quantity, bool)
        or quantity < 1
        or not isinstance(capacity, int)
        or isinstance(capacity, bool)
        or capacity < quantity
    ):
        raise _AbortTransaction("ALLOCATION_INVALID")


def get_mongo_provider_store() -> MongoProviderStore:
    uri, database_name = _configuration()
    provider_bpp_id = os.getenv("MOCK_PROVIDER_BPP_ID", BUS_BPP_ID)
    provider_id = os.getenv("MOCK_PROVIDER_ID", BUS_PROVIDER_ID)
    key = (uri, database_name, provider_bpp_id, provider_id)
    with _CLIENT_LOCK:
        store = _CLIENTS.get(key)
        if store is None:
            store = MongoProviderStore(uri, database_name, provider_bpp_id, provider_id)
            _CLIENTS[key] = store
        return store


def close_mongo_provider_stores() -> None:
    with _CLIENT_LOCK:
        for store in _CLIENTS.values():
            store.close()
        _CLIENTS.clear()
