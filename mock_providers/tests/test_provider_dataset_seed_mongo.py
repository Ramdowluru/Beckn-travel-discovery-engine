import os
import shutil
import tempfile
import unittest
from datetime import date
from pathlib import Path
from uuid import uuid4

from pymongo import MongoClient

from common.mongo_order_store import MongoProviderStore
from scripts.provider_dataset_seed import seed


TEST_URI = os.getenv("TEST_PROVIDER_MONGO_URL", "mongodb://127.0.0.1:27018/?replicaSet=rs0")
ROOT = Path(__file__).resolve().parents[1]


class ProviderDatasetSeedMongoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = MongoClient(TEST_URI, serverSelectionTimeoutMS=2000)
        try:
            hello = cls.client.admin.command("hello")
        except Exception as error:
            cls.client.close()
            raise unittest.SkipTest(f"isolated replica set unavailable: {type(error).__name__}")
        if not hello.get("setName") and hello.get("msg") != "isdbgrid":
            cls.client.close()
            raise unittest.SkipTest("test endpoint is not a transaction-capable replica set")

    @classmethod
    def tearDownClass(cls):
        cls.client.close()

    def test_apply_rerun_changed_balance_slots_and_conflict(self):
        database = f"test_dataset_seed_{uuid4().hex}"
        provider_dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, provider_dir)
        shutil.copy2(ROOT / "mock_experience" / "data.json", provider_dir / "data.json")
        (provider_dir / ".env").write_text(
            f"PROVIDER_MONGO_URL={TEST_URI}\nPROVIDER_DB_NAME={database}\n",
            encoding="utf-8",
        )
        try:
            first = seed(provider_dir, date(2026, 11, 6), True)
            self.assertGreater(first["inserted"], 15000)
            self.assertEqual(self.client[database].inventory.count_documents({"slot": "09:00"}), 7500)
            self.assertEqual(self.client[database].inventory.count_documents({"slot": "15:00"}), 7500)

            changed_id = "experience:EXP-DATA-01-1:2026-11-06:09:00"
            self.client[database].inventory.update_one(
                {"_id": changed_id},
                {"$set": {"available": 1}},
            )
            rerun = seed(provider_dir, date(2026, 11, 6), True)
            self.assertEqual(rerun["inserted"], 0)
            self.assertEqual(self.client[database].inventory.find_one({"_id": changed_id})["available"], 1)

            self.client[database].services.update_one(
                {"_id": "EXP-DATA-01-1"},
                {"$set": {"name": "conflict"}},
            )
            with self.assertRaises(RuntimeError):
                seed(provider_dir, date(2026, 11, 6), True)
        finally:
            self.client.drop_database(database)

