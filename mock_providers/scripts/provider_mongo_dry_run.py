#!/usr/bin/env python3
"""Read-only provider catalog/SQLite migration preflight."""

import argparse
from collections import Counter
from datetime import date
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
from typing import Any


EXPECTED_BPP_ID = "mock-bus.example.in"


def _catalog_services(catalog: dict[str, Any]) -> list[dict[str, Any]]:
    if isinstance(catalog.get("services"), list):
        return catalog["services"]
    services: list[dict[str, Any]] = []
    for hotel in catalog.get("hotels", []):
        for room in hotel.get("rooms", []):
            services.append({
                **room,
                "service_id": f"{catalog['provider']['bpp_id']}:{hotel['hotel_id']}:{room['room_id']}",
                "name": room.get("name"),
                "price": room.get("price"),
                "seats_available": room.get("availability"),
                "_catalog_kind": "hotel",
                "_inventory_id": f"{hotel['hotel_id']}:{room['room_id']}",
            })
    for experience in catalog.get("experiences", []):
        services.append({
            **experience,
            "service_id": experience["experience_id"],
            "seats_available": experience.get("slots_remaining"),
            "_catalog_kind": "experience",
        })
    return services


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_sqlite(path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    connection = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise ValueError("SQLite integrity check failed.")
        orders = [dict(row) for row in connection.execute(
            "SELECT order_id, transaction_id, init_message_id, state, order_json, bap_id, "
            "confirm_message_id, cancel_message_id, inventory_allocations_json "
            "FROM provider_orders ORDER BY order_id"
        )]
        inventory = [dict(row) for row in connection.execute(
            "SELECT resource_key, available FROM inventory ORDER BY resource_key"
        )]
        return orders, inventory, []
    finally:
        connection.close()


def audit(
    catalog_path: Path,
    sqlite_path: Path,
    expected_bpp_id: str | None = None,
) -> dict[str, Any]:
    catalog_bytes = catalog_path.read_bytes()
    catalog = json.loads(catalog_bytes)
    orders, inventory, _ = _read_sqlite(sqlite_path)
    issues: list[dict[str, str]] = []
    conflicts: list[str] = []

    provider = catalog.get("provider", {})
    expected_bpp_id = expected_bpp_id or provider.get("bpp_id") or EXPECTED_BPP_ID
    if provider.get("bpp_id") != expected_bpp_id:
        conflicts.append("catalog_bpp_id_mismatch")
    provider_id = provider.get("id")
    services = _catalog_services(catalog)
    if not isinstance(services, list) or not services:
        conflicts.append("catalog_services_missing")
        services = []
    service_ids: set[str] = set()
    for service in services:
        service_id = service.get("service_id") if isinstance(service, dict) else None
        if not isinstance(service_id, str) or not service_id or service_id in service_ids:
            conflicts.append("catalog_service_id_invalid_or_duplicate")
            continue
        service_ids.add(service_id)
        price = service.get("price")
        try:
            if not isinstance(price, dict) or isinstance(price.get("amount"), bool):
                raise ValueError
            amount = Decimal(str(price["amount"]))
            if not amount.is_finite() or amount < 0:
                raise ValueError
            if not isinstance(price.get("currency"), str) or not price["currency"]:
                raise ValueError
        except (KeyError, TypeError, ValueError, InvalidOperation):
            conflicts.append("catalog_price_invalid")

    inventory_by_key: dict[str, int] = {}
    for record in inventory:
        key = record["resource_key"]
        parts = key.split(":")
        inventory_service_id = ":".join(parts[1:-1]) if parts[0] == "hotel" else parts[1]
        hotel_service_ids = {
            service.get("_inventory_id")
            for service in services
            if service.get("_catalog_kind") == "hotel"
        }
        if len(parts) < 3 or (
            parts[1] not in service_ids
            and inventory_service_id not in hotel_service_ids
        ) or parts[0] not in {
            "transport", "hotel", "experience"
        }:
            conflicts.append("inventory_key_not_in_catalog")
            continue
        try:
            date.fromisoformat(parts[2] if parts[0] != "hotel" else parts[-1])
            if not isinstance(record["available"], int) or record["available"] < 0:
                raise ValueError
        except (TypeError, ValueError):
            conflicts.append("inventory_date_or_balance_invalid")
            continue
        if key in inventory_by_key:
            conflicts.append("duplicate_inventory_key")
        inventory_by_key[key] = record["available"]

    state_counts: Counter[str] = Counter()
    seen_orders: set[str] = set()
    seen_init: set[tuple[str, str]] = set()
    for row_index, row in enumerate(orders, start=1):
        state_counts[row["state"]] += 1
        try:
            order = json.loads(row["order_json"])
        except (TypeError, ValueError):
            conflicts.append("order_json_invalid")
            continue
        if not isinstance(order, dict):
            conflicts.append("order_json_not_object")
            continue
        if row["order_id"] in seen_orders:
            conflicts.append("duplicate_order_id")
        seen_orders.add(row["order_id"])
        identity = (row["transaction_id"], row["init_message_id"])
        if identity in seen_init:
            conflicts.append("duplicate_init_correlation")
        seen_init.add(identity)
        if order.get("id") != row["order_id"] or order.get("state") != row["state"]:
            conflicts.append("order_identity_or_state_mismatch")
        if order.get("provider", {}).get("id") != provider_id:
            conflicts.append("order_provider_id_mismatch")
        items = order.get("items")
        if (
            not isinstance(items, list)
            or len(items) != 1
            or not isinstance(items[0], dict)
            or items[0].get("id") not in service_ids
        ):
            conflicts.append("order_item_id_mismatch")
        if not row["bap_id"]:
            issues.append({"record": f"R{row_index:02d}", "issue": "bap_id_missing"})
        allocations_raw = row["inventory_allocations_json"]
        if allocations_raw:
            try:
                allocations = json.loads(allocations_raw)
                if not isinstance(allocations, list) or not allocations:
                    raise ValueError
                for allocation in allocations:
                    key = allocation.get("resource_key")
                    quantity = allocation.get("quantity")
                    capacity = allocation.get("initial_capacity")
                    if (
                        key not in inventory_by_key
                        or not isinstance(quantity, int)
                        or isinstance(quantity, bool)
                        or quantity < 1
                        or not isinstance(capacity, int)
                        or isinstance(capacity, bool)
                        or capacity < quantity
                    ):
                        conflicts.append("allocation_invalid_or_inventory_missing")
            except (TypeError, ValueError):
                conflicts.append("allocation_json_invalid")
        elif row["state"] == "CONFIRMED":
            issues.append({"record": f"R{row_index:02d}", "issue": "confirmed_allocation_missing"})

    # Labels are deterministic per source order and contain no customer data.
    unsafe_labels = sorted({entry["record"] for entry in issues})
    return {
        "mode": "read-only dry-run",
        "source_sha256": {
            "catalog": hashlib.sha256(catalog_bytes).hexdigest(),
            "sqlite": _sha256(sqlite_path),
        },
        "catalog": {
            "provider_id": provider_id if provider_id == "mock-bus" else "present",
            "bpp_id_matches": provider.get("bpp_id") == expected_bpp_id,
            "service_count": len(service_ids),
        },
        "sqlite": {
            "order_count": len(orders),
            "order_states": dict(sorted(state_counts.items())),
            "inventory_count": len(inventory),
        },
        "warnings": issues,
        "records_to_preserve_as_historical_and_block": unsafe_labels,
        "conflicts": sorted(set(conflicts)),
        "safe_to_import": not issues and not conflicts,
        "writes_performed": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Read-only BusProvider Mongo migration preflight; never connects to MongoDB.",
        epilog=(
            "Before any future import: stop provider writes, make and verify a timestamped backup "
            "of the SQLite file and catalog JSON, then rerun this dry-run. Import must use a "
            "source-fingerprint ledger and abort on changed source or conflicting target records. "
            "Rollback before Mongo writes: restore the prior storage selector to SQLite. After "
            "Mongo writes: quiesce the provider and reconcile/reverse-sync changes before switching back."
        ),
    )
    parser.add_argument("--catalog", type=Path, required=True, help="BusProvider data.json")
    parser.add_argument("--sqlite", type=Path, required=True, help="BusProvider SQLite database")
    parser.add_argument("--provider-bpp-id", help="Expected provider BPP ID")
    args = parser.parse_args()
    try:
        result = audit(args.catalog, args.sqlite, args.provider_bpp_id)
    except (OSError, sqlite3.Error, json.JSONDecodeError, ValueError) as error:
        print(json.dumps({
            "mode": "read-only dry-run",
            "result": "FAIL",
            "failure_category": type(error).__name__,
            "writes_performed": False,
        }, sort_keys=True))
        return 2
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["safe_to_import"] else 1


if __name__ == "__main__":
    sys.exit(main())
