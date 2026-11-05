#!/usr/bin/env python3
"""Generate and seed the deterministic multi-city provider catalog.

The command is dry-run by default.  ``--apply`` is required for MongoDB
writes, and writes are additive: an existing identical document is skipped
and a conflicting document aborts the transaction.
"""

from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import json
from pathlib import Path
import sys
from typing import Any, Iterable

from bson import BSON
from pymongo import InsertOne

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from common.mongo_order_store import (  # noqa: E402
    MongoProviderStore,
    provider_to_mongo_document,
    service_to_mongo_document,
)

IST = timezone(timedelta(hours=5, minutes=30))
DATA_ROOT = PROJECT_ROOT
BATCH_SIZE = 250


class SeedApplyError(RuntimeError):
    def __init__(self, message: str, counts: dict[str, int]):
        super().__init__(message)
        self.counts = counts

CITY_ROWS = (
    ("Vijayawada", "VJA", "VGA", "Andhra Pradesh", "16.5062,80.6480"),
    ("Hyderabad", "HYD", "HYD", "Telangana", "17.3850,78.4867"),
    ("Bengaluru", "BLR", "BLR", "Karnataka", "12.9716,77.5946"),
    ("Chennai", "MAA", "MAA", "Tamil Nadu", "13.0827,80.2707"),
    ("Mumbai", "BOM", "BOM", "Maharashtra", "19.0760,72.8777"),
    ("Delhi", "DEL", "DEL", "Delhi", "28.6139,77.2090"),
    ("Pune", "PNQ", "PNQ", "Maharashtra", "18.5204,73.8567"),
    ("Visakhapatnam", "VSKP", "VTZ", "Andhra Pradesh", "17.6868,83.2185"),
    ("Tirupati", "TIR", "TIR", "Andhra Pradesh", "13.6288,79.4192"),
    ("Kochi", "COK", "COK", "Kerala", "9.9312,76.2673"),
    ("Kolkata", "CCU", "CCU", "West Bengal", "22.5726,88.3639"),
    ("Ahmedabad", "AMD", "AMD", "Gujarat", "23.0225,72.5714"),
    ("Jaipur", "JAI", "JAI", "Rajasthan", "26.9124,75.7873"),
    ("Lucknow", "LKO", "LKO", "Uttar Pradesh", "26.8467,80.9462"),
    ("Bhopal", "BHO", "BHO", "Madhya Pradesh", "23.2599,77.4126"),
    ("Indore", "IDR", "IDR", "Madhya Pradesh", "22.7196,75.8577"),
    ("Nagpur", "NAG", "NAG", "Maharashtra", "21.1458,79.0882"),
    ("Coimbatore", "CJB", "CJB", "Tamil Nadu", "11.0168,76.9558"),
    ("Madurai", "IXM", "IXM", "Tamil Nadu", "9.9252,78.1198"),
    ("Thiruvananthapuram", "TRV", "TRV", "Kerala", "8.5241,76.9366"),
    ("Bhubaneswar", "BBI", "BBI", "Odisha", "20.2961,85.8245"),
    ("Patna", "PAT", "PAT", "Bihar", "25.5941,85.1376"),
    ("Varanasi", "VNS", "VNS", "Uttar Pradesh", "25.3176,82.9739"),
    ("Chandigarh", "IXC", "IXC", "Chandigarh", "30.7333,76.7794"),
    ("Goa", "GOI", "GOI", "Goa", "15.4909,73.8278"),
)
CITIES = {
    name: {"city": name, "code": code, "airport": airport, "state": state, "gps": gps}
    for name, code, airport, state, gps in CITY_ROWS
}


def _pairs(count: int) -> list[tuple[str, str]]:
    names = [row[0] for row in CITY_ROWS]
    pairs: list[tuple[str, str]] = []
    for distance in (1, 2, 3):
        for index, name in enumerate(names):
            candidate = (name, names[(index + distance) % len(names)])
            pair = tuple(sorted(candidate))
            if pair not in pairs and (distance < 3 or len(pairs) < count):
                pairs.append(pair)
                if len(pairs) == count:
                    return pairs
    raise AssertionError("not enough deterministic city pairs")


def _location(name: str, airport: bool = False) -> dict[str, str]:
    city = CITIES[name]
    return {
        "code": city["airport"] if airport else city["code"],
        "city": city["city"],
        "state": city["state"],
        "gps": city["gps"],
    }


def _price(amount: int) -> dict[str, Any]:
    return {"amount": Decimal(str(amount)), "currency": "INR"}


def _transport_services(provider: dict[str, Any], kind: str) -> list[dict[str, Any]]:
    prefix = {"bus": "BUS", "train": "TRN", "flight": "FLT"}[kind]
    services = []
    for index, (first, second) in enumerate(_pairs(60 if kind in {"bus", "train"} else 40), 1):
        for direction, (source, target) in enumerate(((first, second), (second, first))):
            for variant in (1, 2):
                service_id = f"{prefix}-DATA-{index:03d}-{direction + 1}-{variant}"
                base = {
                    "service_id": service_id,
                    "name": f"{provider['name']} {source}-{target} {variant}",
                    "mode": provider["type"],
                    "from": _location(source, kind == "flight"),
                    "to": _location(target, kind == "flight"),
                    "departure_time": ("06:30" if variant == 1 else "18:45"),
                    "duration_minutes": 90 + ((index * 17 + variant * 11) % 600),
                    "price": _price((300 if kind == "bus" else 2200) + index * 23 + variant * 175),
                    "seats_available": 18 + ((index + variant) % 24),
                }
                if kind == "bus":
                    base["bus_type"] = "AC Seater" if variant == 1 else "AC Sleeper"
                elif kind == "train":
                    base["train_number"] = str(60000 + index * 10 + variant)
                    base["class"] = "Sleeper (SL)" if variant == 1 else "3rd AC (3A)"
                else:
                    base.update({"flight_number": f"SB{index:03d}{variant}", "cabin": "Economy"})
                services.append(base)
    return services


def _hotel_catalog(provider: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    hotels: list[dict[str, Any]] = []
    services: list[dict[str, Any]] = []
    room_types = (("STD", "Standard", 2), ("DLX", "Deluxe", 3), ("STE", "Executive Suite", 4))
    for city_index, city_name in enumerate(CITIES, 1):
        for property_index in range(1, 6):
            hotel = {
                "hotel_id": f"HTL-DATA-{city_index:02d}-{property_index}",
                "name": f"StayNest {city_name} Central {property_index}",
                "category": "HOTEL",
                "city": _location(city_name),
                "rating": round(3.8 + ((city_index + property_index) % 12) / 10, 1),
                "amenities": ["wifi", "restaurant", "parking", "ac"],
                "images": [],
                "rooms": [],
            }
            for room_index, (suffix, name, capacity) in enumerate(room_types, 1):
                room_id = f"{hotel['hotel_id']}-{suffix}"
                room = {
                    "room_id": room_id,
                    "name": name,
                    "capacity": capacity,
                    "price": {"amount": 1800 + city_index * 71 + property_index * 90 + room_index * 600,
                              "currency": "INR", "per": "night"},
                    "availability": 4 + ((city_index + property_index + room_index) % 9),
                }
                hotel["rooms"].append(room)
                services.append({
                    **deepcopy(room),
                    "service_id": f"{provider['bpp_id']}:{hotel['hotel_id']}:{room_id}",
                    "_inventory_id": f"{hotel['hotel_id']}:{room_id}",
                    "_catalog_kind": "hotel",
                    "hotel_id": hotel["hotel_id"],
                    "hotel_name": hotel["name"],
                    "hotel_city": deepcopy(hotel["city"]),
                    "price": _price(room["price"]["amount"]),
                })
            hotels.append(hotel)
    return hotels, services


def _experience_catalog(provider: dict[str, Any]) -> list[dict[str, Any]]:
    services = []
    for city_index, city_name in enumerate(CITIES, 1):
        for activity_index in range(1, 6):
            services.append({
                "experience_id": f"EXP-DATA-{city_index:02d}-{activity_index}",
                "service_id": f"EXP-DATA-{city_index:02d}-{activity_index}",
                "name": f"{city_name} Signature Experience {activity_index}",
                "category": ("WALKING_TOUR", "FOOD", "ADVENTURE", "SIGHTSEEING", "WATER")[(activity_index - 1) % 5],
                "description": f"Curated {city_name} experience {activity_index}.",
                "city": _location(city_name),
                "duration_minutes": 90 + activity_index * 30,
                "price": _price(500 + city_index * 37 + activity_index * 125),
                "slots_remaining": 8 + ((city_index + activity_index) % 13),
                "highlights": [city_name.lower(), "local", "guided"],
                "images": [],
            })
    return services


def _service_documents(provider: dict[str, Any], services: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return [service_to_mongo_document(provider["bpp_id"], service) for service in services]


def generate(provider_dir: Path, start_date: date, days: int = 60) -> dict[str, Any]:
    source = json.loads((provider_dir / "data.json").read_text(encoding="utf-8"))
    provider = source["provider"]
    kind = provider["id"].removeprefix("mock-")
    if kind not in {"bus", "train", "flight", "hotel", "experience"}:
        raise ValueError(f"unsupported provider: {provider['id']}")
    if kind in {"bus", "train", "flight"}:
        services = _transport_services(provider, kind)
        catalog = {"provider": provider, "services": services}
        slots = [""]
    elif kind == "hotel":
        hotels, services = _hotel_catalog(provider)
        catalog = {"provider": provider, "hotels": hotels}
        slots = [""]
    else:
        services = _experience_catalog(provider)
        catalog = {"provider": provider, "experiences": services}
        slots = ["09:00", "15:00"]

    inventory = []
    for service in services:
        service_id = service.get("_inventory_id", service["service_id"])
        capacity = int(service.get("seats_available", service.get("availability", service.get("slots_remaining", 0))))
        for offset in range(days):
            service_date = start_date + timedelta(days=offset)
            for slot in slots:
                key = f"{'transport' if kind in {'bus', 'train', 'flight'} else kind}:{service_id}:{service_date.isoformat()}"
                if slot:
                    key += f":{slot}"
                inventory.append({
                    "_id": key,
                    "providerBppId": provider["bpp_id"],
                    "serviceId": service_id,
                    "serviceDate": service_date.isoformat(),
                    **({"slot": slot} if slot else {}),
                    "available": capacity,
                    "initialCapacity": capacity,
                })
    service_docs = _service_documents(provider, services)
    documents = [("providers", provider_to_mongo_document(provider))]
    documents += [("services", document) for document in service_docs]
    documents += [("inventory", document) for document in inventory]
    return {
        "provider": provider,
        "kind": kind,
        "catalog": catalog,
        "documents": documents,
        "counts": {
            "cities": len(CITIES),
            "transport_pairs": 60 if kind in {"bus", "train"} else (40 if kind == "flight" else 0),
            "activities": len(services) if kind == "experience" else 0,
            "slots_per_activity": 2 if kind == "experience" else 0,
            "services": len(services),
            "inventory": len(inventory),
        },
        "bson_bytes": sum(len(BSON.encode(document)) for _, document in documents),
        "start_date": start_date.isoformat(),
        "end_date": (start_date + timedelta(days=days - 1)).isoformat(),
    }


def _same(left: Any, right: Any) -> bool:
    def canonical(value: Any) -> Any:
        if isinstance(value, Decimal):
            return {"decimal": str(value)}
        if hasattr(value, "to_decimal"):
            return {"decimal": str(value.to_decimal())}
        if isinstance(value, dict):
            return {key: canonical(item) for key, item in sorted(value.items()) if key != "_id"}
        if isinstance(value, list):
            return [canonical(item) for item in value]
        return value
    return canonical(left) == canonical(right)


def _same_for_seed(collection_name: str, left: dict[str, Any], right: dict[str, Any]) -> bool:
    if collection_name != "inventory":
        return _same(left, right)
    if not isinstance(left.get("available"), int) or not 0 <= left["available"] <= left.get("initialCapacity", -1):
        return False
    left_immutable = {key: value for key, value in left.items() if key != "available"}
    right_immutable = {key: value for key, value in right.items() if key != "available"}
    return _same(left_immutable, right_immutable)


def seed(provider_dir: Path, start_date: date, apply: bool, batch_size: int = BATCH_SIZE) -> dict[str, Any]:
    generated = generate(provider_dir, start_date)
    if not apply:
        return {key: value for key, value in generated.items() if key not in {"documents", "catalog", "provider"}}
    from dotenv import dotenv_values

    config = dotenv_values(provider_dir / ".env")
    uri, database = config.get("PROVIDER_MONGO_URL"), config.get("PROVIDER_DB_NAME")
    if not uri or not database:
        raise ValueError("provider .env must define PROVIDER_MONGO_URL and PROVIDER_DB_NAME")
    store = MongoProviderStore(uri, database, generated["provider"]["bpp_id"], generated["provider"]["id"])
    try:
        store.verify_transactions()
        store.ensure_indexes()
        collections = {"providers": store.providers, "services": store.services, "inventory": store.inventory}
        counts = {"inserted": 0, "skipped": 0, "conflicts": 0, "committed_batches": 0}
        grouped = _group_documents(generated["documents"])
        try:
            for collection_name, documents in grouped.items():
                collection = collections[collection_name]
                for offset in range(0, len(documents), batch_size):
                    batch = documents[offset:offset + batch_size]
                    with store._client.start_session() as session:
                        def operation(tx):
                            batch_counts = {"inserted": 0, "skipped": 0}
                            existing = {
                                document["_id"]: document
                                for document in collection.find(
                                    {"_id": {"$in": [item["_id"] for item in batch]}},
                                    session=tx,
                                )
                            }
                            pending_documents = []
                            for document in batch:
                                stored = existing.get(document["_id"])
                                if stored is None:
                                    pending_documents.append(document)
                                elif _same_for_seed(collection_name, stored, document):
                                    batch_counts["skipped"] += 1
                                else:
                                    raise ValueError(
                                        f"conflicting generated record: {collection_name}/{document['_id']}"
                                    )
                            if pending_documents:
                                result = collection.bulk_write(
                                    [InsertOne(document) for document in pending_documents],
                                    ordered=True,
                                    session=tx,
                                )
                                batch_counts["inserted"] += result.inserted_count
                            return batch_counts
                        batch_counts = session.with_transaction(operation)
                    counts["inserted"] += batch_counts["inserted"]
                    counts["skipped"] += batch_counts["skipped"]
                    counts["committed_batches"] += 1
        except Exception as error:
            if "conflicting generated record" in str(error):
                counts["conflicts"] += 1
            raise SeedApplyError(str(error), counts) from error
        return {**{key: value for key, value in generated.items() if key not in {"documents", "catalog", "provider"}}, **counts}
    finally:
        store.close()


def _group_documents(documents: list[tuple[str, dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for name, document in documents:
        grouped.setdefault(name, []).append(document)
    return grouped


def classify_existing(collection, documents: list[dict[str, Any]], session=None) -> tuple[list[dict[str, Any]], int]:
    """Return documents safe to insert and the number of identical replays."""
    pending = []
    skipped = 0
    for document in documents:
        existing = collection.find_one({"_id": document["_id"]}, session=session)
        if existing is None:
            pending.append(document)
        elif _same(existing, document):
            skipped += 1
        else:
            raise ValueError(f"conflicting generated record: {collection.name}/{document['_id']}")
    return pending, skipped


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate/seed deterministic provider data; dry-run is default.")
    parser.add_argument("--provider", choices=("bus", "train", "flight", "hotel", "experience"), required=True)
    parser.add_argument("--start-date", type=date.fromisoformat, help="Testing override; defaults to today in Asia/Kolkata.")
    parser.add_argument("--apply", action="store_true", help="Write additive records to the provider Mongo database.")
    args = parser.parse_args()
    try:
        start = args.start_date or datetime.now(IST).date()
        provider_dir = PROJECT_ROOT / f"mock_{args.provider}"
        result = seed(provider_dir, start, args.apply)
        result["mode"] = "apply" if args.apply else "dry-run"
        result["estimated_storage_bytes"] = int(result["bson_bytes"] * 2.5)
        result.pop("bson_bytes", None)
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except SeedApplyError as error:
        failure_reason = "record_conflict" if error.counts["conflicts"] else "batch_write_failure"
        print(json.dumps({
            "mode": "apply",
            "result": "FAIL",
            "failure_category": type(error.__cause__ or error).__name__,
            "failure_reason": failure_reason,
            "committed_writes": error.counts["inserted"],
            **error.counts,
            "writes_performed": error.counts["inserted"] > 0,
        }))
        return 2
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(json.dumps({"mode": "apply" if args.apply else "dry-run", "result": "FAIL",
                          "failure_category": type(error).__name__, "writes_performed": False}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
