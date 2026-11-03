import asyncio
import unittest
from datetime import datetime, timedelta, timezone

from app.repositories.transport_snapshots import (
    SnapshotExpiredError,
    SnapshotNotFoundError,
    TransportSnapshotRepository,
)


class FakeCollection:
    def __init__(self) -> None:
        self.documents: dict[tuple[str, str], dict] = {}

    async def create_index(self, *_args, **_kwargs):
        return "index"

    async def replace_one(self, lookup, document, upsert):
        self.documents[(lookup["transactionId"], lookup["offerId"])] = document

    async def find_one(self, lookup):
        return self.documents.get((lookup["transactionId"], lookup["offerId"]))


class FakeDatabase:
    def __init__(self, collection: FakeCollection) -> None:
        self.collection = collection

    def __getitem__(self, name):
        self.assert_collection_name = name
        return self.collection


class TransportSnapshotRepositoryTests(unittest.TestCase):
    def setUp(self):
        self.collection = FakeCollection()
        self.repository = TransportSnapshotRepository(
            FakeDatabase(self.collection),
            ttl_seconds=900,
        )
        self.offer = {
            "id": "mock-bus.example.in:BUS-001",
            "unitPrice": 450,
            "totalPrice": 900,
            "travellerCount": 2,
        }
        self.query = {
            "from": "Vijayawada",
            "to": "Hyderabad",
            "date": "2026-10-28",
            "travellers": 2,
        }

    def test_round_trip_returns_stored_offer_and_query(self):
        async def scenario():
            await self.repository.save_many(
                transaction_id="tx-1",
                query=self.query,
                offers=[self.offer],
            )
            result = await self.repository.get(
                transaction_id="tx-1",
                offer_id=self.offer["id"],
            )
            self.assertEqual(result["offer"], self.offer)
            self.assertEqual(result["query"], self.query)

        asyncio.run(scenario())

    def test_unknown_offer_is_not_found(self):
        async def scenario():
            with self.assertRaises(SnapshotNotFoundError):
                await self.repository.get(
                    transaction_id="tx-unknown",
                    offer_id=self.offer["id"],
                )

        asyncio.run(scenario())

    def test_expired_offer_is_rejected(self):
        async def scenario():
            await self.repository.save_many(
                transaction_id="tx-expired",
                query=self.query,
                offers=[self.offer],
            )
            self.collection.documents[("tx-expired", self.offer["id"])]["expiresAt"] = (
                datetime.now(timezone.utc) - timedelta(seconds=1)
            )
            with self.assertRaises(SnapshotExpiredError):
                await self.repository.get(
                    transaction_id="tx-expired",
                    offer_id=self.offer["id"],
                )

        asyncio.run(scenario())

    def test_expired_naive_utc_offer_is_rejected(self):
        async def scenario():
            await self.repository.save_many(
                transaction_id="tx-expired-naive",
                query=self.query,
                offers=[self.offer],
            )
            self.collection.documents[("tx-expired-naive", self.offer["id"])]["expiresAt"] = (
                datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=1)
            )
            with self.assertRaises(SnapshotExpiredError):
                await self.repository.get(
                    transaction_id="tx-expired-naive",
                    offer_id=self.offer["id"],
                )

        asyncio.run(scenario())

    def test_same_offer_id_isolated_by_transaction(self):
        async def scenario():
            other_query = {**self.query, "date": "2026-11-02", "travellers": 1}
            await self.repository.save_many(
                transaction_id="tx-date-one",
                query=self.query,
                offers=[self.offer],
            )
            await self.repository.save_many(
                transaction_id="tx-date-two",
                query=other_query,
                offers=[{**self.offer, "travellerCount": 1, "totalPrice": 450}],
            )
            first = await self.repository.get(
                transaction_id="tx-date-one",
                offer_id=self.offer["id"],
            )
            second = await self.repository.get(
                transaction_id="tx-date-two",
                offer_id=self.offer["id"],
            )
            self.assertEqual(first["query"]["date"], "2026-10-28")
            self.assertEqual(second["query"]["date"], "2026-11-02")
            self.assertEqual(first["offer"]["travellerCount"], 2)
            self.assertEqual(second["offer"]["travellerCount"], 1)

        asyncio.run(scenario())
