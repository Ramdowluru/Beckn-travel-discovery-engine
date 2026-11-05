import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from scripts.provider_mongo_dry_run import audit


class ProviderMongoDryRunTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.catalog_path = self.root / "catalog.json"
        self.sqlite_path = self.root / "provider.sqlite3"
        self.catalog_path.write_text(json.dumps({
            "provider": {"id": "mock-bus", "bpp_id": "mock-bus.example.in"},
            "services": [{
                "service_id": "BUS-SYNTHETIC",
                "price": {"amount": 12.34, "currency": "INR"},
            }],
        }), encoding="utf-8")
        connection = sqlite3.connect(self.sqlite_path)
        connection.executescript("""
            CREATE TABLE provider_orders (
                order_id TEXT PRIMARY KEY,
                transaction_id TEXT NOT NULL,
                init_message_id TEXT NOT NULL,
                state TEXT NOT NULL,
                order_json TEXT NOT NULL,
                bap_id TEXT NOT NULL DEFAULT '',
                confirm_message_id TEXT,
                cancel_message_id TEXT,
                inventory_allocations_json TEXT
            );
            CREATE TABLE inventory (
                resource_key TEXT PRIMARY KEY,
                available INTEGER NOT NULL
            );
        """)
        connection.execute(
            "INSERT INTO inventory(resource_key, available) VALUES (?, ?)",
            ("transport:BUS-SYNTHETIC:2030-01-01", 4),
        )
        self.order = {
            "id": "synthetic-order",
            "state": "INITIALIZED",
            "provider": {"id": "mock-bus"},
            "items": [{"id": "BUS-SYNTHETIC"}],
        }
        connection.execute(
            "INSERT INTO provider_orders VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                self.order["id"],
                "synthetic-transaction",
                "synthetic-init",
                "INITIALIZED",
                json.dumps(self.order),
                "synthetic-bap",
                None,
                None,
                None,
            ),
        )
        connection.commit()
        connection.close()

    def tearDown(self):
        self.temporary.cleanup()

    def test_valid_synthetic_sources_pass_without_writes(self):
        before = self.sqlite_path.read_bytes()
        report = audit(self.catalog_path, self.sqlite_path)
        self.assertTrue(report["safe_to_import"])
        self.assertFalse(report["writes_performed"])
        self.assertEqual(self.sqlite_path.read_bytes(), before)

    def test_missing_ownership_and_allocation_are_only_reported(self):
        self.order["state"] = "CONFIRMED"
        connection = sqlite3.connect(self.sqlite_path)
        connection.execute(
            "UPDATE provider_orders SET state=?, order_json=?, bap_id='', inventory_allocations_json=NULL",
            ("CONFIRMED", json.dumps(self.order)),
        )
        connection.commit()
        before_balance = connection.execute("SELECT available FROM inventory").fetchone()[0]
        connection.close()

        report = audit(self.catalog_path, self.sqlite_path)
        self.assertFalse(report["safe_to_import"])
        self.assertEqual(
            {warning["issue"] for warning in report["warnings"]},
            {"bap_id_missing", "confirmed_allocation_missing"},
        )
        self.assertEqual(report["records_to_preserve_as_historical_and_block"], ["R01"])
        connection = sqlite3.connect(self.sqlite_path)
        self.assertEqual(connection.execute("SELECT available FROM inventory").fetchone()[0], before_balance)
        connection.close()
