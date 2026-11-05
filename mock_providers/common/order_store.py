import json
import os
from pathlib import Path
import sqlite3
from contextlib import closing
from typing import Any

from common.mongo_order_store import BUS_BPP_ID, get_mongo_provider_store


def mongo_storage_enabled(provider_id: str) -> bool:
    if provider_id != BUS_BPP_ID:
        return False
    backend = os.getenv("MOCK_BUS_STORAGE_BACKEND", "sqlite").strip().lower()
    if backend not in {"sqlite", "mongodb"}:
        raise RuntimeError("MOCK_BUS_STORAGE_BACKEND must be sqlite or mongodb.")
    return backend == "mongodb"


def _mongo_store(provider_id: str):
    return get_mongo_provider_store() if mongo_storage_enabled(provider_id) else None

def _database_path(provider_id: str) -> Path:
    configured = os.environ.get("MOCK_PROVIDER_STATE_DIR")
    if configured:
        directory = Path(configured)
    else:
        keys_directory = Path(
            os.environ.get(
                "BECKN_KEYS_DIR",
                Path(__file__).resolve().parents[2] / ".local" / "beckn",
            )
        )
        directory = keys_directory.parent / "providers"
    directory.mkdir(parents=True, exist_ok=True)
    safe_id = "".join(character for character in provider_id if character.isalnum() or character in "-_")
    if not safe_id:
        raise ValueError("Provider identifier is invalid.")
    return directory / f"{safe_id}.sqlite3"


def _connect(provider_id: str) -> sqlite3.Connection:
    database = sqlite3.connect(_database_path(provider_id), timeout=10)
    database.row_factory = sqlite3.Row
    database.execute("PRAGMA busy_timeout = 10000")
    database.execute(
        """CREATE TABLE IF NOT EXISTS provider_orders (
            order_id TEXT PRIMARY KEY,
            transaction_id TEXT NOT NULL,
            init_message_id TEXT NOT NULL,
            state TEXT NOT NULL,
            order_json TEXT NOT NULL,
            bap_id TEXT NOT NULL DEFAULT '',
            confirm_message_id TEXT,
            UNIQUE(transaction_id, init_message_id)
        )"""
    )
    columns = {row["name"] for row in database.execute("PRAGMA table_info(provider_orders)")}
    if "bap_id" not in columns:
        database.execute("ALTER TABLE provider_orders ADD COLUMN bap_id TEXT NOT NULL DEFAULT ''")
    if "confirm_message_id" not in columns:
        database.execute("ALTER TABLE provider_orders ADD COLUMN confirm_message_id TEXT")
    if "inventory_allocations_json" not in columns:
        database.execute("ALTER TABLE provider_orders ADD COLUMN inventory_allocations_json TEXT")
    if "cancel_message_id" not in columns:
        database.execute("ALTER TABLE provider_orders ADD COLUMN cancel_message_id TEXT")
    database.execute(
        """CREATE TABLE IF NOT EXISTS inventory (
            resource_key TEXT PRIMARY KEY,
            available INTEGER NOT NULL CHECK(available >= 0)
        )"""
    )
    return database


def save_initialized_order(
    provider_id: str,
    transaction_id: str,
    message_id: str,
    order: dict[str, Any],
    bap_id: str = "",
) -> None:
    store = _mongo_store(provider_id)
    if store is not None:
        store.save_initialized_order(provider_id, transaction_id, message_id, order, bap_id)
        return
    with closing(_connect(provider_id)) as database:
        database.execute(
            """INSERT INTO provider_orders
               (order_id, transaction_id, init_message_id, state, order_json, bap_id)
               VALUES (?, ?, ?, 'INITIALIZED', ?, ?)
               ON CONFLICT(transaction_id, init_message_id) DO NOTHING""",
            (
                order["id"],
                transaction_id,
                message_id,
                json.dumps(order, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
                bap_id,
            ),
        )
        stored = database.execute(
            """SELECT order_id, order_json, bap_id FROM provider_orders
               WHERE transaction_id = ? AND init_message_id = ?""",
            (transaction_id, message_id),
        ).fetchone()
        if (
            stored is None
            or stored["order_id"] != order["id"]
            or (bap_id and stored["bap_id"] != bap_id)
        ):
            raise sqlite3.IntegrityError("Provider order identity conflicts with an existing order.")
        database.commit()


def get_order(provider_id: str, order_id: str) -> dict[str, Any] | None:
    store = _mongo_store(provider_id)
    if store is not None:
        return store.get_order(provider_id, order_id)
    path = _database_path(provider_id)
    if not path.exists():
        return None
    with closing(_connect(provider_id)) as database:
        row = database.execute(
            "SELECT order_json FROM provider_orders WHERE order_id = ?",
            (order_id,),
        ).fetchone()
    return json.loads(row["order_json"]) if row else None


def get_initialized_order(provider_id: str, order_id: str) -> dict[str, Any] | None:
    store = _mongo_store(provider_id)
    if store is not None:
        return store.get_initialized_order(provider_id, order_id)
    path = _database_path(provider_id)
    if not path.exists():
        return None
    with closing(_connect(provider_id)) as database:
        row = database.execute(
            "SELECT order_json FROM provider_orders WHERE order_id = ? AND state = 'INITIALIZED'",
            (order_id,),
        ).fetchone()
    return json.loads(row["order_json"]) if row else None


def get_order_owner(provider_id: str, order_id: str) -> tuple[str, str, str] | None:
    store = _mongo_store(provider_id)
    if store is not None:
        return store.get_order_owner(provider_id, order_id)
    path = _database_path(provider_id)
    if not path.exists():
        return None
    with closing(_connect(provider_id)) as database:
        row = database.execute(
            """SELECT transaction_id, bap_id, state FROM provider_orders
               WHERE order_id = ?""",
            (order_id,),
        ).fetchone()
    return (row["transaction_id"], row["bap_id"], row["state"]) if row else None


def get_inventory_available(provider_id: str, resource_key: str, initial_capacity: int) -> int:
    store = _mongo_store(provider_id)
    if store is not None:
        return store.get_inventory_available(provider_id, resource_key, initial_capacity)
    with closing(_connect(provider_id)) as database:
        database.execute(
            "INSERT INTO inventory(resource_key, available) VALUES (?, ?) ON CONFLICT(resource_key) DO NOTHING",
            (resource_key, initial_capacity),
        )
        row = database.execute(
            "SELECT available FROM inventory WHERE resource_key = ?",
            (resource_key,),
        ).fetchone()
        database.commit()
    return int(row["available"])


def confirm_provider_order(
    *,
    provider_id: str,
    order_id: str,
    transaction_id: str,
    bap_id: str,
    message_id: str,
    order: dict[str, Any],
    requirements: list[tuple[str, int, int]],
) -> tuple[str, dict[str, Any] | None]:
    """Confirm and deduct all required inventory in one durable transaction."""
    store = _mongo_store(provider_id)
    if store is not None:
        return store.confirm_provider_order(
            provider_id=provider_id,
            order_id=order_id,
            transaction_id=transaction_id,
            bap_id=bap_id,
            message_id=message_id,
            order=order,
            requirements=requirements,
        )
    database = _connect(provider_id)
    try:
        database.execute("BEGIN IMMEDIATE")
        existing = database.execute(
            """SELECT transaction_id, bap_id, state, order_json, confirm_message_id
               FROM provider_orders WHERE order_id = ?""",
            (order_id,),
        ).fetchone()
        if (
            existing is None
            or existing["transaction_id"] != transaction_id
            or existing["bap_id"] != bap_id
        ):
            database.rollback()
            return "NOT_FOUND", None
        if existing["state"] == "CONFIRMED":
            saved_order = json.loads(existing["order_json"])
            database.commit()
            return "CONFIRMED", saved_order
        if existing["state"] != "INITIALIZED":
            database.rollback()
            return "NOT_INITIALIZED", None

        for resource_key, quantity, initial_capacity in requirements:
            database.execute(
                "INSERT INTO inventory(resource_key, available) VALUES (?, ?) ON CONFLICT(resource_key) DO NOTHING",
                (resource_key, initial_capacity),
            )
            row = database.execute(
                "SELECT available FROM inventory WHERE resource_key = ?",
                (resource_key,),
            ).fetchone()
            if row is None or row["available"] < quantity:
                database.rollback()
                return "UNAVAILABLE", None

        for resource_key, quantity, _ in requirements:
            updated = database.execute(
                """UPDATE inventory SET available = available - ?
                   WHERE resource_key = ? AND available >= ?""",
                (quantity, resource_key, quantity),
            )
            if updated.rowcount != 1:
                database.rollback()
                return "UNAVAILABLE", None

        database.execute(
            """UPDATE provider_orders SET state = 'CONFIRMED', confirm_message_id = ?, order_json = ?,
               inventory_allocations_json = ?
               WHERE order_id = ? AND state = 'INITIALIZED'""",
            (
                message_id,
                json.dumps(order, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
                json.dumps(
                    [
                        {
                            "resource_key": resource_key,
                            "quantity": quantity,
                            "initial_capacity": initial_capacity,
                        }
                        for resource_key, quantity, initial_capacity in requirements
                    ],
                    separators=(",", ":"),
                    allow_nan=False,
                ),
                order_id,
            ),
        )
        database.commit()
        return "CONFIRMED", order
    except Exception:
        database.rollback()
        raise
    finally:
        database.close()


def cancel_provider_order(
    *,
    provider_id: str,
    order_id: str,
    transaction_id: str,
    bap_id: str,
    message_id: str,
    cancelled_order: dict[str, Any],
) -> tuple[str, dict[str, Any] | None]:
    """Persist cancellation and restore the original allocation atomically."""
    store = _mongo_store(provider_id)
    if store is not None:
        return store.cancel_provider_order(
            provider_id=provider_id,
            order_id=order_id,
            transaction_id=transaction_id,
            bap_id=bap_id,
            message_id=message_id,
            cancelled_order=cancelled_order,
        )
    database = _connect(provider_id)
    try:
        database.execute("BEGIN IMMEDIATE")
        existing = database.execute(
            """SELECT transaction_id, bap_id, state, order_json, inventory_allocations_json
               FROM provider_orders WHERE order_id = ?""",
            (order_id,),
        ).fetchone()
        if (
            existing is None
            or existing["transaction_id"] != transaction_id
            or existing["bap_id"] != bap_id
        ):
            database.rollback()
            return "NOT_FOUND", None
        if existing["state"] == "CANCELLED":
            saved_order = json.loads(existing["order_json"])
            database.commit()
            return "CANCELLED", saved_order
        if existing["state"] != "CONFIRMED":
            database.rollback()
            return "NOT_CONFIRMED", None
        if not existing["inventory_allocations_json"]:
            database.rollback()
            return "ALLOCATION_MISSING", None

        allocations = json.loads(existing["inventory_allocations_json"])
        if not isinstance(allocations, list) or not allocations:
            database.rollback()
            return "ALLOCATION_MISSING", None
        for allocation in allocations:
            resource_key = allocation.get("resource_key")
            quantity = allocation.get("quantity")
            if (
                not isinstance(resource_key, str)
                or not isinstance(quantity, int)
                or isinstance(quantity, bool)
                or quantity < 1
            ):
                database.rollback()
                return "ALLOCATION_INVALID", None
            restored = database.execute(
                "UPDATE inventory SET available = available + ? WHERE resource_key = ?",
                (quantity, resource_key),
            )
            if restored.rowcount != 1:
                database.rollback()
                return "ALLOCATION_MISSING", None

        updated = database.execute(
            """UPDATE provider_orders
               SET state = 'CANCELLED', cancel_message_id = ?, order_json = ?
               WHERE order_id = ? AND state = 'CONFIRMED'""",
            (
                message_id,
                json.dumps(cancelled_order, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
                order_id,
            ),
        )
        if updated.rowcount != 1:
            database.rollback()
            return "NOT_CONFIRMED", None
        database.commit()
        return "CANCELLED", cancelled_order
    except Exception:
        database.rollback()
        raise
    finally:
        database.close()
