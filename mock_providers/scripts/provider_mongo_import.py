#!/usr/bin/env python3
"""Dry-run or explicitly apply a provider SQLite-to-Mongo migration."""

from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import sys
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from pymongo.errors import DuplicateKeyError, PyMongoError

from common.mongo_order_store import (
    MongoProviderStore,
    MongoStorageConfigurationError,
    MongoTransactionsUnsupported,
    provider_to_mongo_document,
    service_to_mongo_document,
)
from scripts.provider_mongo_dry_run import _catalog_services, _read_sqlite, audit


def _source_hash(catalog_path: Path, sqlite_path: Path) -> str:
    digest = hashlib.sha256()
    for path in (catalog_path, sqlite_path):
        digest.update(hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()


def _canonical(value: Any) -> Any:
    if isinstance(value, Decimal):
        return {"$decimal": str(value)}
    if hasattr(value, "to_decimal"):
        return {"$decimal": str(value.to_decimal())}
    if isinstance(value, datetime):
        return {"$datetime": value.isoformat()}
    if isinstance(value, dict):
        return {str(key): _canonical(item) for key, item in sorted(value.items()) if key != "_id"}
    if isinstance(value, list):
        return [_canonical(item) for item in value]
    return value


def _same(left: Any, right: Any) -> bool:
    return _canonical(left) == _canonical(right)


def _order_document(
    row: dict[str, Any],
    order: dict[str, Any],
    provider_bpp_id: str,
) -> dict[str, Any]:
    allocations = None
    if row["inventory_allocations_json"]:
        allocations = [
            {
                "resourceKey": item["resource_key"],
                "quantity": item["quantity"],
                "initialCapacity": item["initial_capacity"],
            }
            for item in json.loads(row["inventory_allocations_json"])
        ]
    unsafe = not row["bap_id"] or (row["state"] == "CONFIRMED" and not allocations)
    return {
        "_id": row["order_id"],
        "providerBppId": provider_bpp_id,
        "providerId": order.get("provider", {}).get("id"),
        "transactionId": row["transaction_id"],
        "initMessageId": row["init_message_id"],
        "bapId": row["bap_id"],
        "state": row["state"],
        "order": order,
        "confirmMessageId": row["confirm_message_id"],
        "cancelMessageId": row["cancel_message_id"],
        "inventoryAllocations": allocations,
        "historicalUnsafe": unsafe,
        "mutationBlocked": unsafe,
    }


def _inventory_documents(
    catalog: dict[str, Any],
    rows: list[dict[str, Any]],
    provider_bpp_id: str,
) -> list[dict[str, Any]]:
    services = {}
    for service in _catalog_services(catalog):
        services[service["service_id"]] = service
        if service.get("_inventory_id"):
            services[service["_inventory_id"]] = service
    documents = []
    for row in rows:
        parts = row["resource_key"].split(":")
        service_key = ":".join(parts[1:-1]) if parts[0] == "hotel" else parts[1]
        service = services[service_key]
        service_date = parts[-1] if parts[0] == "hotel" else parts[2]
        service_id = ":".join(parts[1:-1]) if parts[0] == "hotel" else parts[1]
        documents.append({
            "_id": row["resource_key"],
            "providerBppId": provider_bpp_id,
            "serviceId": service_id,
            "serviceDate": service_date,
            "available": row["available"],
            "initialCapacity": service.get("seats_available", service.get("availability", 0)),
        })
    return documents


def _warning_documents(
    migration_id: str,
    source_hash: str,
    warnings: list[dict[str, str]],
    orders: list[dict[str, Any]],
    provider_bpp_id: str,
) -> list[dict[str, Any]]:
    by_label = {f"R{index:02d}": row for index, row in enumerate(orders, start=1)}
    documents = []
    for warning in warnings:
        row = by_label[warning["record"]]
        documents.append({
            "_id": f"{migration_id}:{warning['record']}:{warning['issue']}",
            "migrationId": migration_id,
            "recordLabel": warning["record"],
            "issue": warning["issue"],
            "providerBppId": provider_bpp_id,
            "providerOrderId": row["order_id"],
            "sourceHash": source_hash,
            "historicalUnsafe": True,
            "mutationBlocked": True,
        })
    return documents


def _put(collection, document: dict[str, Any], session) -> str:
    existing = collection.find_one({"_id": document["_id"]}, session=session)
    if existing is not None:
        if not _same(existing, document):
            raise ValueError(f"conflicting record in {collection.name}: {document['_id']}")
        return "skipped"
    try:
        collection.insert_one(document, session=session)
    except DuplicateKeyError as error:
        raise ValueError(f"conflicting record in {collection.name}: {document['_id']}") from error
    return "inserted"


def _verify_documents(store: MongoProviderStore, documents, warning_documents) -> None:
    collections = {
        "providers": store.providers,
        "services": store.services,
        "inventory": store.inventory,
        "provider_orders": store.orders,
    }
    ids_by_collection: dict[str, list[str]] = {}
    for collection_name, document in documents:
        stored = collections[collection_name].find_one({"_id": document["_id"]})
        if stored is None or not _same(stored, document):
            raise ValueError(f"import verification failed in {collection_name}: {document['_id']}")
        ids_by_collection.setdefault(collection_name, []).append(document["_id"])
    for collection_name, ids in ids_by_collection.items():
        count = collections[collection_name].count_documents({"_id": {"$in": ids}})
        if count != len(ids):
            raise ValueError(f"import count verification failed in {collection_name}")
    for document in warning_documents:
        stored = store.warnings.find_one({"_id": document["_id"]})
        if stored is None or not _same(stored, document):
            raise ValueError(f"import verification failed in provider_migration_warnings: {document['_id']}")


def migrate(
    catalog_path: Path,
    sqlite_path: Path,
    store: MongoProviderStore | None,
    apply: bool,
) -> dict[str, Any]:
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    provider_bpp_id = catalog["provider"]["bpp_id"]
    provider_id = catalog["provider"]["id"]
    result = audit(catalog_path, sqlite_path, provider_bpp_id)
    if result["conflicts"]:
        raise ValueError("source validation conflicts: " + ",".join(result["conflicts"]))
    orders, inventory, _ = _read_sqlite(sqlite_path)
    source_hash = _source_hash(catalog_path, sqlite_path)
    migration_id = f"{provider_id}-provider:{source_hash}"
    services = _catalog_services(catalog)
    documents = [
        ("providers", provider_to_mongo_document(catalog["provider"])),
        *[("services", service_to_mongo_document(provider_bpp_id, service)) for service in services],
        *[("inventory", document) for document in _inventory_documents(catalog, inventory, provider_bpp_id)],
    ]
    for row in orders:
        order = json.loads(row["order_json"])
        documents.append(("provider_orders", _order_document(row, order, provider_bpp_id)))
    warning_documents = _warning_documents(
        migration_id, source_hash, result["warnings"], orders, provider_bpp_id
    )
    summary = {
        "mode": "apply" if apply else "dry-run",
        "migration_id": migration_id,
        "source_hash": source_hash,
        "orders": len(orders),
        "inventory": len(inventory),
        "services": len(services),
        "warnings": len(warning_documents),
        "writes_performed": False,
    }
    if not apply:
        return summary

    if store is None:
        raise ValueError("Mongo store is required when applying a migration")
    store.verify_transactions()
    store.ensure_indexes()
    with store._client.start_session() as session:
        def operation(transaction_session):
            ledger = store.database["provider_migrations"].find_one(
                {"_id": migration_id}, session=transaction_session
            )
            if ledger is not None and not _same(ledger.get("sourceHash"), source_hash):
                raise ValueError("migration ledger conflicts with source hash")
            counts = {"inserted": 0, "skipped": 0}
            collections = {
                "providers": store.providers,
                "services": store.services,
                "inventory": store.inventory,
                "provider_orders": store.orders,
            }
            for collection_name, document in documents:
                counts[_put(collections[collection_name], document, transaction_session)] += 1
            for document in warning_documents:
                counts[_put(store.warnings, document, transaction_session)] += 1
            ledger_document = {
                "_id": migration_id,
                "providerBppId": provider_bpp_id,
                "sourceHash": source_hash,
                "catalogHash": result["source_sha256"]["catalog"],
                "sqliteHash": result["source_sha256"]["sqlite"],
                "counts": {
                    "orders": len(orders),
                    "inventory": len(inventory),
                    "services": len(services),
                    "warnings": len(warning_documents),
                },
            }
            if ledger is None:
                store.database["provider_migrations"].insert_one(
                    ledger_document, session=transaction_session
                )
                counts["inserted"] += 1
            elif not _same(ledger, ledger_document):
                raise ValueError("migration ledger conflicts with imported values")
            return counts

        counts = session.with_transaction(operation)
    _verify_documents(store, documents, warning_documents)
    summary.update(counts)
    summary["writes_performed"] = counts["inserted"] > 0
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Provider Mongo migration; dry-run is the default.")
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--mongo-uri", help="Mongo URI; never echoed")
    parser.add_argument("--database", help="Target database name")
    parser.add_argument("--backup-dir", type=Path)
    parser.add_argument("--apply", action="store_true", help="Required to write MongoDB")
    args = parser.parse_args()
    backup_path = None
    try:
        catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
        provider = catalog["provider"]
        provider_bpp_id = provider["bpp_id"]
        provider_id = provider["id"]
        if args.apply:
            if not args.mongo_uri or not args.database:
                raise ValueError("--mongo-uri and --database are required with --apply")
            if not args.sqlite.is_file():
                raise FileNotFoundError(args.sqlite)
            backup_dir = args.backup_dir or args.sqlite.parent
            backup_dir.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            backup_path = backup_dir / f"{args.sqlite.name}.pre-mongo-{stamp}.bak"
            shutil.copy2(args.sqlite, backup_path)
        if args.apply:
            store = MongoProviderStore(
                args.mongo_uri,
                args.database,
                provider_bpp_id,
                provider_id,
            )
            try:
                result = migrate(args.catalog, args.sqlite, store, True)
            finally:
                store.close()
        else:
            result = migrate(
                args.catalog,
                args.sqlite,
                None,
                False,
            )
        if backup_path:
            result["sqlite_backup"] = str(backup_path)
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except (
        OSError,
        sqlite3.Error,
        ValueError,
        KeyError,
        json.JSONDecodeError,
        MongoStorageConfigurationError,
        MongoTransactionsUnsupported,
        PyMongoError,
    ) as error:
        print(json.dumps({
            "mode": "apply" if args.apply else "dry-run",
            "result": "FAIL",
            "failure_category": type(error).__name__,
            "writes_performed": False,
        }))
        return 2


if __name__ == "__main__":
    sys.exit(main())
