import unittest
from datetime import date
from pathlib import Path

from bson.decimal128 import Decimal128

from scripts.provider_dataset_seed import _same_for_seed, classify_existing, generate


ROOT = Path(__file__).resolve().parents[1]


class ProviderDatasetSeedTests(unittest.TestCase):
    class _Collection:
        name = "synthetic"

        def __init__(self, documents):
            self.documents = {document["_id"]: document for document in documents}

        def find_one(self, query, session=None):
            return self.documents.get(query["_id"])

    def test_scope_and_counts_are_deterministic(self):
        expected = {
            "bus": (240, 14400, 60),
            "train": (240, 14400, 60),
            "flight": (160, 9600, 40),
            "hotel": (375, 22500, 0),
            "experience": (125, 15000, 0),
        }
        for provider, (services, inventory, pairs) in expected.items():
            with self.subTest(provider=provider):
                result = generate(ROOT / f"mock_{provider}", date(2026, 11, 6))
                self.assertEqual(result["counts"]["services"], services)
                self.assertEqual(result["counts"]["inventory"], inventory)
                self.assertEqual(result["counts"]["transport_pairs"], pairs)
                self.assertEqual(result["start_date"], "2026-11-06")
                self.assertEqual(result["end_date"], "2027-01-04")
                self.assertEqual(len(result["documents"]), 1 + services + inventory)

    def test_routes_use_valid_locations_and_vijayawada_hyderabad(self):
        for provider in ("bus", "train", "flight"):
            result = generate(ROOT / f"mock_{provider}", date(2026, 11, 6))
            services = result["catalog"]["services"]
            routes = {
                (service["from"]["city"], service["to"]["city"])
                for service in services
            }
            self.assertIn(("Vijayawada", "Hyderabad"), routes)
            self.assertIn(("Hyderabad", "Vijayawada"), routes)
            for service in services:
                self.assertNotEqual(service["from"]["city"], service["to"]["city"])
                self.assertGreater(service["price"]["amount"], 0)
                self.assertGreater(service["seats_available"], 0)
                if provider == "flight":
                    self.assertEqual(len(service["from"]["code"]), 3)
                    self.assertEqual(len(service["to"]["code"]), 3)

    def test_hotel_and_experience_schema_and_decimal_prices(self):
        hotel = generate(ROOT / "mock_hotel", date(2026, 11, 6))
        self.assertEqual(len(hotel["catalog"]["hotels"]), 125)
        self.assertTrue(all(len(item["rooms"]) == 3 for item in hotel["catalog"]["hotels"]))
        experience = generate(ROOT / "mock_experience", date(2026, 11, 6))
        self.assertEqual(experience["counts"]["activities"], 125)
        self.assertEqual(experience["counts"]["slots_per_activity"], 2)
        self.assertEqual(
            {document["slot"] for name, document in experience["documents"]
             if name == "inventory"},
            {"09:00", "15:00"},
        )
        service_docs = [document for name, document in hotel["documents"] if name == "services"]
        self.assertTrue(all(isinstance(document["price"]["amount"], Decimal128) for document in service_docs))
        inventory = [document for name, document in experience["documents"] if name == "inventory"]
        self.assertEqual(len({(document["serviceId"], document["serviceDate"], document["slot"])
                               for document in inventory}), len(inventory))

    def test_generation_does_not_modify_source_data(self):
        paths = [ROOT / f"mock_{provider}" / "data.json"
                 for provider in ("bus", "train", "flight", "hotel", "experience")]
        before = {path: path.read_bytes() for path in paths}
        for path in paths:
            generate(path.parent, date(2026, 11, 6))
        self.assertEqual(before, {path: path.read_bytes() for path in paths})

    def test_identical_replay_skips_and_conflict_is_rejected(self):
        document = {"_id": "synthetic-1", "value": 7}
        collection = self._Collection([document])
        pending, skipped = classify_existing(collection, [dict(document)])
        self.assertEqual(pending, [])
        self.assertEqual(skipped, 1)
        with self.assertRaisesRegex(ValueError, "conflicting generated record"):
            classify_existing(collection, [{"_id": "synthetic-1", "value": 8}])

    def test_changed_inventory_balance_is_preserved_on_rerun(self):
        desired = {
            "_id": "experience:EXP-SYN:2026-11-06:09:00",
            "providerBppId": "mock-experience.example.in",
            "serviceId": "EXP-SYN",
            "serviceDate": "2026-11-06",
            "slot": "09:00",
            "available": 8,
            "initialCapacity": 10,
        }
        changed = {**desired, "available": 6}
        self.assertTrue(_same_for_seed("inventory", changed, desired))
        self.assertFalse(_same_for_seed("inventory", {**desired, "initialCapacity": 11}, desired))
