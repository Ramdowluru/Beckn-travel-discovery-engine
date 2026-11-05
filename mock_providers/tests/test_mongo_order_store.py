import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from unittest.mock import patch
from urllib.parse import urlsplit
from uuid import uuid4

from bson.decimal128 import Decimal128
from pymongo import MongoClient

from common.inventory import quote_total
from common.mongo_order_store import (
    BUS_BPP_ID,
    MongoProviderStore,
    MongoStorageConfigurationError,
    MongoTransactionsUnsupported,
    provider_to_mongo_document,
    service_to_mongo_document,
)
from common.order_store import mongo_storage_enabled, _mongo_store


TEST_URI = os.getenv("TEST_PROVIDER_MONGO_URL")


def _is_loopback_uri(uri: str) -> bool:
    parsed = urlsplit(uri)
    if parsed.scheme != "mongodb" or not parsed.netloc:
        return False
    hosts = parsed.netloc.rsplit("@", 1)[-1].split(",")
    return all(
        entry.split(":")[0].strip("[]").lower() in {"localhost", "127.0.0.1", "::1"}
        for entry in hosts
    )


class MongoProviderStoreTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not TEST_URI:
            raise unittest.SkipTest("Set TEST_PROVIDER_MONGO_URL to an isolated loopback MongoDB test deployment.")
        if not _is_loopback_uri(TEST_URI):
            raise unittest.SkipTest("Mongo adapter tests only accept a loopback test MongoDB URI.")
        cls.client = MongoClient(TEST_URI, serverSelectionTimeoutMS=2000, connectTimeoutMS=2000)
        try:
            cls.hello = cls.client.admin.command("hello")
        except Exception as error:
            cls.client.close()
            raise unittest.SkipTest("The isolated loopback MongoDB test deployment is unavailable.") from error
        cls.transactions_supported = bool(cls.hello.get("setName") or cls.hello.get("msg") == "isdbgrid")

    @classmethod
    def tearDownClass(cls):
        if getattr(cls, "client", None) is not None:
            cls.client.close()

    def setUp(self):
        self.database_name = f"test_bus_provider_{uuid4().hex}"
        self.store = MongoProviderStore(TEST_URI, self.database_name)
        self.store.ensure_indexes()
        self.provider_id = BUS_BPP_ID

    def tearDown(self):
        self.store._client.drop_database(self.database_name)
        self.store.close()

    def test_catalog_decimal_conversion_and_date_inventory(self):
        self.store.providers.insert_one(provider_to_mongo_document({
                "id": "mock-bus",
                "name": "Synthetic Bus",
                "type": "BUS",
                "category": "transport",
                "bpp_id": self.provider_id,
                "bpp_uri": "http://127.0.0.1:5001",
            }))
        self.store.services.insert_one({
            **service_to_mongo_document(self.provider_id, {
                "service_id": "BUS-SYNTHETIC",
                "name": "Synthetic Route",
                "mode": "BUS",
                "bus_type": "Seater",
                "from": {"code": "AAA", "city": "Alpha"},
                "to": {"code": "BBB", "city": "Beta"},
                "departure_time": "08:00",
                "duration_minutes": 60,
                "price": {"amount": Decimal("12.34"), "currency": "INR"},
                "seats_available": 3,
            }),
        })
        self.assertIsInstance(
            self.store.services.find_one({"_id": "BUS-SYNTHETIC"})["price"]["amount"],
            Decimal128,
        )
        catalog = self.store.load_catalog(self.provider_id)
        self.assertEqual(catalog["provider"]["id"], "mock-bus")
        self.assertEqual(catalog["services"][0]["service_id"], "BUS-SYNTHETIC")
        self.assertEqual(catalog["services"][0]["price"]["amount"], Decimal("12.34"))
        self.assertEqual(
            quote_total(catalog, "transport", {
                "items": [{
                    "id": "BUS-SYNTHETIC",
                    "quantity": {"selected": {"count": 2}},
                }],
            }),
            ("INR", "24.68"),
        )

        day_one = "transport:BUS-SYNTHETIC:2030-01-01"
        day_two = "transport:BUS-SYNTHETIC:2030-01-02"
        self.assertEqual(self.store.get_inventory_available(self.provider_id, day_one, 3), 3)
        self.store.inventory.update_one({"_id": day_one}, {"$set": {"available": 1}})
        self.assertEqual(self.store.get_inventory_available(self.provider_id, day_one, 3), 1)
        self.assertEqual(self.store.get_inventory_available(self.provider_id, day_two, 3), 3)

    def test_legacy_or_untrusted_owner_is_not_mutated(self):
        if not self.transactions_supported:
            self.skipTest("Historical-order transaction checks require a replica set or mongos.")
        order = self._order("unsafe-order", "tx-unsafe")
        self.store.orders.insert_one({
            "_id": order["id"],
            "providerBppId": self.provider_id,
            "transactionId": "tx-unsafe",
            "initMessageId": "init-unsafe",
            "bapId": "bap.synthetic",
            "state": "CONFIRMED",
            "order": order,
            "inventoryAllocations": None,
            "historicalUnsafe": True,
            "mutationBlocked": True,
        })
        status, saved = self.store.confirm_provider_order(
            provider_id=self.provider_id,
            order_id=order["id"],
            transaction_id="tx-unsafe",
            bap_id="bap.synthetic",
            message_id="confirm-unsafe",
            order=order,
            requirements=[("transport:BUS-SYNTHETIC:2030-01-01", 1, 3)],
        )
        self.assertEqual((status, saved), ("UNSAFE_HISTORICAL", None))
        self.assertEqual(self.store.orders.find_one({"_id": order["id"]})["state"], "CONFIRMED")

    def test_migration_warnings_are_separate_and_rerun_safe(self):
        if not self.transactions_supported:
            self.skipTest("Migration warning enforcement requires a replica set or mongos.")
        orders = [
            self._order("legacy-one", "tx-legacy-one"),
            self._order("legacy-two", "tx-legacy-two"),
        ]
        for order in orders:
            self.store.orders.insert_one({
                "_id": order["id"],
                "providerBppId": self.provider_id,
                "transactionId": order["transactionId"],
                "initMessageId": f"init-{order['id']}",
                "bapId": "bap.synthetic",
                "state": "INITIALIZED",
                "order": order,
            })
        warnings = [
            {"recordLabel": "R01", "issue": "bap_id_missing", "orderId": orders[0]["id"]},
            {
                "recordLabel": "R02",
                "issue": "confirmed_allocation_missing",
                "orderId": orders[1]["id"],
            },
        ]
        self.store.record_migration_warnings("migration-test", "sha256-test", warnings)
        self.store.record_migration_warnings("migration-test", "sha256-test", warnings)
        self.assertEqual(self.store.warnings.count_documents({"migrationId": "migration-test"}), 2)
        self.assertEqual(
            self.store.warnings.count_documents({
                "migrationId": "migration-test",
                "mutationBlocked": True,
                "historicalUnsafe": True,
            }),
            2,
        )
        status, saved = self.store.confirm_provider_order(
            provider_id=self.provider_id,
            order_id=orders[0]["id"],
            transaction_id=orders[0]["transactionId"],
            bap_id="bap.synthetic",
            message_id="confirm-legacy-one",
            order=orders[0],
            requirements=[("transport:BUS-SYNTHETIC:2030-01-01", 1, 3)],
        )
        self.assertEqual((status, saved), ("UNSAFE_HISTORICAL", None))
        self.assertEqual(
            self.store.orders.find_one({"_id": orders[0]["id"]})["state"],
            "INITIALIZED",
        )

    def test_standalone_deployment_fails_closed_for_transactions(self):
        if self.transactions_supported:
            self.store.verify_transactions()
            self.assertTrue(self.hello.get("setName") or self.hello.get("msg") == "isdbgrid")
        else:
            with self.assertRaises(MongoTransactionsUnsupported):
                self.store.verify_transactions()

    def test_sqlite_remains_default_and_mongo_missing_config_does_not_fall_back(self):
        with patch.dict(os.environ, {"MOCK_BUS_STORAGE_BACKEND": "sqlite"}, clear=False):
            self.assertFalse(mongo_storage_enabled(BUS_BPP_ID))
        with patch.dict(os.environ, {
            "MOCK_BUS_STORAGE_BACKEND": "mongodb",
            "PROVIDER_MONGO_URL": "",
            "PROVIDER_DB_NAME": "",
        }, clear=False):
            with self.assertRaises(MongoStorageConfigurationError):
                _mongo_store(BUS_BPP_ID)

    def test_confirm_cancel_atomicity_replay_and_concurrent_capacity(self):
        if not self.transactions_supported:
            self.skipTest("Write transaction assertions require a replica set or mongos.")
        self.store.verify_transactions()
        resource = "transport:BUS-SYNTHETIC:2030-01-01"
        self.store.inventory.insert_one({
            "_id": resource,
            "providerBppId": self.provider_id,
            "serviceId": "BUS-SYNTHETIC",
            "serviceDate": "2030-01-01",
            "available": 2,
            "initialCapacity": 2,
        })
        orders = [self._order(f"concurrent-{index}", f"tx-{index}") for index in range(2)]
        for order in orders:
            self.store.save_initialized_order(
                self.provider_id,
                order["transactionId"],
                f"init-{order['id']}",
                order,
                "bap.synthetic",
            )

        def confirm(order):
            return self.store.confirm_provider_order(
                provider_id=self.provider_id,
                order_id=order["id"],
                transaction_id=order["transactionId"],
                bap_id="bap.synthetic",
                message_id=f"confirm-{order['id']}",
                order={**order, "state": "CONFIRMED"},
                requirements=[(resource, 2, 2)],
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            outcomes = list(executor.map(confirm, orders))
        self.assertEqual(sorted(status for status, _ in outcomes), ["CONFIRMED", "UNAVAILABLE"])
        self.assertEqual(
            self.store.inventory.find_one({"_id": resource})["available"],
            0,
        )

        confirmed_index = next(i for i, outcome in enumerate(outcomes) if outcome[0] == "CONFIRMED")
        confirmed = orders[confirmed_index]
        confirmed_order = outcomes[confirmed_index][1]
        replay = self.store.confirm_provider_order(
            provider_id=self.provider_id,
            order_id=confirmed["id"],
            transaction_id=confirmed["transactionId"],
            bap_id="bap.synthetic",
            message_id=f"confirm-{confirmed['id']}",
            order=confirmed_order,
            requirements=[(resource, 2, 2)],
        )
        self.assertEqual(replay, ("CONFIRMED", confirmed_order))
        self.assertEqual(self.store.inventory.find_one({"_id": resource})["available"], 0)

        cancelled_order = {**confirmed_order, "state": "CANCELLED"}
        cancelled = self.store.cancel_provider_order(
            provider_id=self.provider_id,
            order_id=confirmed["id"],
            transaction_id=confirmed["transactionId"],
            bap_id="bap.synthetic",
            message_id=f"cancel-{confirmed['id']}",
            cancelled_order=cancelled_order,
        )
        self.assertEqual(cancelled, ("CANCELLED", cancelled_order))
        self.assertEqual(self.store.inventory.find_one({"_id": resource})["available"], 2)
        self.assertEqual(
            self.store.cancel_provider_order(
                provider_id=self.provider_id,
                order_id=confirmed["id"],
                transaction_id=confirmed["transactionId"],
                bap_id="bap.synthetic",
                message_id=f"cancel-{confirmed['id']}",
                cancelled_order=cancelled_order,
            ),
            cancelled,
        )
        self.assertEqual(self.store.inventory.find_one({"_id": resource})["available"], 2)

    def _order(self, order_id, transaction_id):
        return {
            "id": order_id,
            "transactionId": transaction_id,
            "state": "INITIALIZED",
            "provider": {"id": "mock-bus"},
            "items": [{"id": "BUS-SYNTHETIC", "quantity": {"selected": {"count": 2}}}],
            "fulfillments": [],
            "quote": {"price": {"currency": "INR", "value": "24.68"}},
            "tags": [],
        }
