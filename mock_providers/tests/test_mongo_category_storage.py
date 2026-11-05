import json
import sqlite3
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

from pymongo import MongoClient

from common.mongo_order_store import (
    MongoProviderStore,
    provider_to_mongo_document,
    service_to_mongo_document,
)
from scripts.provider_mongo_import import migrate


TEST_URI = "mongodb://127.0.0.1:27018/?replicaSet=rs0"


class MongoCategoryStorageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = MongoClient(TEST_URI, serverSelectionTimeoutMS=3000)
        cls.client.admin.command("hello")

    @classmethod
    def tearDownClass(cls):
        cls.client.close()

    def _store(self, category):
        database = f"test_{category}_{uuid4().hex}"
        store = MongoProviderStore(TEST_URI, database, f"mock-{category}.example.in", f"mock-{category}")
        store.verify_transactions()
        store.ensure_indexes()
        self.addCleanup(store.close)
        self.addCleanup(store._client.drop_database, database)
        return store

    def _exercise_category(self, category, key, service_id, capacity):
        store = self._store(category)
        bpp_id = store.provider_bpp_id
        provider_id = store.provider_id
        store.providers.insert_one(provider_to_mongo_document({
            "id": provider_id,
            "name": f"Synthetic {category}",
            "bpp_id": bpp_id,
            "bpp_uri": "http://127.0.0.1",
        }))
        store.services.insert_one(service_to_mongo_document(bpp_id, {
            "service_id": service_id,
            "name": service_id,
            "price": {"amount": 100, "currency": "INR"},
            "seats_available": capacity,
        }))
        store.inventory.insert_one({
            "_id": key,
            "providerBppId": bpp_id,
            "serviceId": service_id,
            "serviceDate": key.split(":")[-1],
            "available": capacity,
            "initialCapacity": capacity,
        })
        order_id = f"order-{category}-{uuid4().hex}"
        order = {
            "id": order_id,
            "state": "INITIALIZED",
            "provider": {"id": provider_id},
            "items": [{"id": service_id, "quantity": {"selected": {"count": 1}}}],
        }
        store.orders.insert_one({
            "_id": order_id,
            "providerBppId": bpp_id,
            "providerId": provider_id,
            "transactionId": "tx-" + order_id,
            "initMessageId": "init-" + order_id,
            "bapId": "bap.synthetic",
            "state": "INITIALIZED",
            "order": order,
        })
        result, _ = store.confirm_provider_order(
            provider_id=bpp_id,
            order_id=order_id,
            transaction_id="tx-" + order_id,
            bap_id="bap.synthetic",
            message_id="confirm-1",
            order={**order, "state": "CONFIRMED"},
            requirements=[(key, 1, capacity)],
        )
        self.assertEqual(result, "CONFIRMED")
        self.assertEqual(store.inventory.find_one({"_id": key})["available"], capacity - 1)
        self.assertEqual(
            store.confirm_provider_order(
                provider_id=bpp_id, order_id=order_id,
                transaction_id="tx-" + order_id, bap_id="bap.synthetic",
                message_id="confirm-1", order={**order, "state": "CONFIRMED"},
                requirements=[(key, 1, capacity)],
            )[0],
            "CONFIRMED",
        )
        cancelled = {**order, "state": "CANCELLED"}
        self.assertEqual(
            store.cancel_provider_order(
                provider_id=bpp_id, order_id=order_id,
                transaction_id="tx-" + order_id, bap_id="bap.synthetic",
                message_id="cancel-1", cancelled_order=cancelled,
            )[0],
            "CANCELLED",
        )
        self.assertEqual(store.inventory.find_one({"_id": key})["available"], capacity)
        self.assertEqual(
            store.cancel_provider_order(
                provider_id=bpp_id, order_id=order_id,
                transaction_id="tx-" + order_id, bap_id="bap.synthetic",
                message_id="cancel-1", cancelled_order=cancelled,
            )[0],
            "CANCELLED",
        )

    def test_flight_hotel_experience_atomic_inventory_and_idempotency(self):
        cases = [
            ("flight", "transport:FLT-SYN:2030-01-01", "FLT-SYN", 3),
            ("hotel", "hotel:HTL-SYN:ROOM-SYN:2030-01-01", "mock-hotel.example.in:HTL-SYN:ROOM-SYN", 3),
            ("experience", "experience:EXP-SYN:2030-01-01:09:00", "EXP-SYN", 3),
        ]
        for case in cases:
            with self.subTest(category=case[0]):
                self._exercise_category(*case)

    def test_insufficient_capacity_and_historical_orders_are_blocked(self):
        store = self._store("flight")
        key = "transport:FLT-SYN:2030-01-02"
        store.inventory.insert_one({
            "_id": key, "providerBppId": store.provider_bpp_id,
            "serviceId": "FLT-SYN", "serviceDate": "2030-01-02",
            "available": 0, "initialCapacity": 1,
        })
        order = {
            "id": "insufficient", "state": "INITIALIZED",
            "provider": {"id": store.provider_id},
            "items": [{"id": "FLT-SYN", "quantity": {"selected": {"count": 2}}}],
        }
        store.orders.insert_one({
            "_id": "insufficient", "providerBppId": store.provider_bpp_id,
            "transactionId": "tx-insufficient", "initMessageId": "init-insufficient",
            "bapId": "bap.synthetic", "state": "INITIALIZED", "order": order,
        })
        self.assertEqual(
            store.confirm_provider_order(
                provider_id=store.provider_bpp_id, order_id="insufficient",
                transaction_id="tx-insufficient", bap_id="bap.synthetic",
                message_id="confirm", order=order,
                requirements=[(key, 1, 1)],
            )[0],
            "UNAVAILABLE",
        )
        self.assertEqual(store.inventory.find_one({"_id": key})["available"], 0)

        historical = deepcopy(order)
        historical["id"] = "historical"
        store.orders.insert_one({
            "_id": "historical", "providerBppId": store.provider_bpp_id,
            "transactionId": "tx-historical", "initMessageId": "init-historical",
            "bapId": "bap.synthetic", "state": "CONFIRMED", "order": historical,
            "historicalUnsafe": True, "mutationBlocked": True,
        })
        self.assertEqual(
            store.cancel_provider_order(
                provider_id=store.provider_bpp_id, order_id="historical",
                transaction_id="tx-historical", bap_id="bap.synthetic",
                message_id="cancel", cancelled_order={**historical, "state": "CANCELLED"},
            )[0],
            "UNSAFE_HISTORICAL",
        )

    def test_import_rerun_and_conflict_for_each_category(self):
        for category, catalog_key, service_id, resource_key in [
            ("flight", "services", "FLT-IMP", "transport:FLT-IMP:2030-01-01"),
            ("hotel", "hotels", "mock-hotel.example.in:HTL-IMP:ROOM-IMP", "hotel:HTL-IMP:ROOM-IMP:2030-01-01"),
            ("experience", "experiences", "EXP-IMP", "experience:EXP-IMP:2030-01-01:09:00"),
        ]:
            with self.subTest(category=category):
                root = Path(tempfile.mkdtemp())
                catalog_path = root / "data.json"
                sqlite_path = root / "provider.sqlite3"
                provider_id = f"mock-{category}"
                bpp_id = f"{provider_id}.example.in"
                if category == "hotel":
                    catalog = {
                        "provider": {"id": provider_id, "bpp_id": bpp_id},
                        "hotels": [{"hotel_id": "HTL-IMP", "rooms": [{
                            "room_id": "ROOM-IMP", "name": "Room", "capacity": 2,
                            "price": {"amount": 100, "currency": "INR"}, "availability": 3,
                        }]}],
                    }
                elif category == "experience":
                    catalog = {
                        "provider": {"id": provider_id, "bpp_id": bpp_id},
                        "experiences": [{"experience_id": "EXP-IMP", "name": "Experience",
                            "price": {"amount": 100, "currency": "INR"}, "slots_remaining": 3}],
                    }
                else:
                    catalog = {
                        "provider": {"id": provider_id, "bpp_id": bpp_id},
                        "services": [{
                            "service_id": service_id, "name": service_id,
                            "price": {"amount": 100, "currency": "INR"},
                            "seats_available": 3,
                        }],
                    }
                catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
                connection = sqlite3.connect(sqlite_path)
                connection.executescript(
                    "CREATE TABLE provider_orders (order_id TEXT PRIMARY KEY, transaction_id TEXT, "
                    "init_message_id TEXT, state TEXT, order_json TEXT, bap_id TEXT, "
                    "confirm_message_id TEXT, cancel_message_id TEXT, inventory_allocations_json TEXT);"
                    "CREATE TABLE inventory (resource_key TEXT PRIMARY KEY, available INTEGER);"
                )
                order = {
                    "id": f"import-{category}", "state": "INITIALIZED",
                    "provider": {"id": provider_id},
                    "items": [{"id": service_id}],
                }
                connection.execute(
                    "INSERT INTO provider_orders VALUES (?,?,?,?,?,?,?,?,?)",
                    (order["id"], "tx", "init", "INITIALIZED", json.dumps(order), "bap", None, None, None),
                )
                connection.execute("INSERT INTO inventory VALUES (?,?)", (resource_key, 3))
                connection.commit()
                connection.close()
                store = self._store(category)
                self.assertEqual(migrate(catalog_path, sqlite_path, store, True)["inserted"] > 0, True)
                self.assertEqual(migrate(catalog_path, sqlite_path, store, True)["inserted"], 0)
                catalog["provider"]["name"] = "conflicting source"
                catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
                with self.assertRaises(ValueError):
                    migrate(catalog_path, sqlite_path, store, True)
