import asyncio
import unittest
from datetime import datetime, timezone

from bson import ObjectId

from app.repositories.itineraries import ItineraryRepository


class FakeCursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, *_args):
        return self

    async def to_list(self, length):
        return self.documents[:length]


class FakeCollection:
    def __init__(self):
        self.documents = []

    async def create_index(self, *_args, **_kwargs):
        return "index"

    async def find_one(self, lookup):
        for document in self.documents:
            if all(document.get(key) == value for key, value in lookup.items()):
                return document
        return None

    async def insert_one(self, document):
        self.documents.append(document)

    def find(self, lookup):
        return FakeCursor([
            document for document in self.documents
            if all(document.get(key) == value for key, value in lookup.items())
        ])


class FakeDatabase:
    def __init__(self, collection):
        self.collection = collection

    def __getitem__(self, _name):
        return self.collection


class ItineraryRepositoryTests(unittest.TestCase):
    def setUp(self):
        self.collection = FakeCollection()
        self.repository = ItineraryRepository(FakeDatabase(self.collection))
        self.user_id = ObjectId()
        self.offer = {
            "id": "mock-bus:BUS-001",
            "provider": "Mock Bus",
            "currency": "INR",
            "unitPrice": 450,
            "totalPrice": 900,
        }
        self.query = {
            "from": "Vijayawada",
            "to": "Hyderabad",
            "date": "2026-10-28",
            "travellers": 2,
        }

    def test_save_is_idempotent_and_preserves_snapshot_values(self):
        async def scenario():
            first = await self.repository.save_or_get(
                user_id=self.user_id,
                transaction_id="tx-1",
                offer_id=self.offer["id"],
                offer=self.offer,
                query=self.query,
            )
            second = await self.repository.save_or_get(
                user_id=self.user_id,
                transaction_id="tx-1",
                offer_id=self.offer["id"],
                offer={**self.offer, "totalPrice": 1},
                query={**self.query, "travellers": 1},
            )
            self.assertEqual(first["itineraryId"], second["itineraryId"])
            self.assertEqual(second["transport"]["totalPrice"], 900)
            self.assertEqual(second["query"]["travellers"], 2)
            self.assertEqual(second["priceStatus"], "saved_estimate")
            self.assertEqual(len(self.collection.documents), 1)

        asyncio.run(scenario())

    def test_user_scope_is_applied_to_list_and_detail(self):
        async def scenario():
            saved = await self.repository.save_or_get(
                user_id=self.user_id,
                transaction_id="tx-1",
                offer_id=self.offer["id"],
                offer=self.offer,
                query=self.query,
            )
            self.assertEqual(
                (await self.repository.get_for_user(
                    user_id=self.user_id,
                    itinerary_id=saved["itineraryId"],
                ))["itineraryId"],
                saved["itineraryId"],
            )
            self.assertIsNone(await self.repository.get_for_user(
                user_id=ObjectId(),
                itinerary_id=saved["itineraryId"],
            ))
            self.assertEqual(len(await self.repository.list_for_user(user_id=self.user_id)), 1)

        asyncio.run(scenario())

    def test_saved_document_has_persistent_timestamps_and_no_expiry(self):
        async def scenario():
            saved = await self.repository.save_or_get(
                user_id=self.user_id,
                transaction_id="tx-1",
                offer_id=self.offer["id"],
                offer=self.offer,
                query=self.query,
            )
            self.assertIsInstance(saved["createdAt"], datetime)
            self.assertIsInstance(saved["updatedAt"], datetime)
            self.assertEqual(saved["createdAt"].tzinfo, timezone.utc)
            self.assertNotIn("expiresAt", saved)

        asyncio.run(scenario())
