import asyncio
import unittest
from datetime import datetime, timedelta, timezone

from bson import ObjectId

from app.repositories.sessions import (
    SessionExpiredError,
    SessionNotFoundError,
    SessionRepository,
    SessionRevokedError,
    hash_session_token,
)


class FakeCollection:
    def __init__(self) -> None:
        self.documents: dict[str, dict] = {}
        self.indexes: list[tuple[tuple, dict]] = []

    async def create_index(self, keys, **options):
        self.indexes.append((tuple(keys), options))
        return options["name"]

    async def insert_one(self, document):
        self.documents[document["tokenHash"]] = document

    async def find_one(self, lookup):
        return self.documents.get(lookup["tokenHash"])

    async def update_one(self, lookup, update):
        document = self.documents.get(lookup["tokenHash"])
        if document is not None and "revokedAt" not in document:
            document.update(update["$set"])


class FakeDatabase:
    def __init__(self, collection: FakeCollection) -> None:
        self.collection = collection

    def __getitem__(self, _name):
        return self.collection


class SessionRepositoryTests(unittest.TestCase):
    def setUp(self):
        self.collection = FakeCollection()
        self.repository = SessionRepository(
            FakeDatabase(self.collection),
            lifetime_seconds=7 * 24 * 60 * 60,
        )
        self.user_id = ObjectId()

    def test_create_returns_raw_token_but_persists_only_hash(self):
        async def scenario():
            token, document = await self.repository.create(user_id=self.user_id)

            self.assertTrue(token)
            self.assertNotEqual(document["tokenHash"], token)
            self.assertEqual(document["tokenHash"], hash_session_token(token))
            self.assertNotIn("token", document)
            stored = next(iter(self.collection.documents.values()))
            self.assertNotIn(token, stored.values())
            self.assertEqual(stored["userId"], self.user_id)
            self.assertAlmostEqual(
                (stored["expiresAt"] - stored["createdAt"]).total_seconds(),
                7 * 24 * 60 * 60,
                delta=1,
            )

        asyncio.run(scenario())

    def test_valid_session_can_be_loaded(self):
        async def scenario():
            token, _ = await self.repository.create(user_id=self.user_id)
            session = await self.repository.get(token=token)
            self.assertEqual(session["userId"], self.user_id)

        asyncio.run(scenario())

    def test_missing_session_is_rejected(self):
        async def scenario():
            with self.assertRaises(SessionNotFoundError):
                await self.repository.get(token="missing")

        asyncio.run(scenario())

    def test_expired_aware_session_is_rejected(self):
        async def scenario():
            token, _ = await self.repository.create(user_id=self.user_id)
            stored = self.collection.documents[hash_session_token(token)]
            stored["expiresAt"] = datetime.now(timezone.utc) - timedelta(seconds=1)
            with self.assertRaises(SessionExpiredError):
                await self.repository.get(token=token)

        asyncio.run(scenario())

    def test_expired_naive_utc_session_is_rejected(self):
        async def scenario():
            token, _ = await self.repository.create(user_id=self.user_id)
            stored = self.collection.documents[hash_session_token(token)]
            stored["expiresAt"] = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=1)
            with self.assertRaises(SessionExpiredError):
                await self.repository.get(token=token)

        asyncio.run(scenario())

    def test_revoked_session_is_rejected(self):
        async def scenario():
            token, _ = await self.repository.create(user_id=self.user_id)
            await self.repository.revoke(token=token)
            with self.assertRaises(SessionRevokedError):
                await self.repository.get(token=token)

        asyncio.run(scenario())

    def test_indexes_include_unique_hash_and_ttl_expiry(self):
        async def scenario():
            await self.repository.ensure_indexes()
            options_by_name = {
                options["name"]: options
                for _, options in self.collection.indexes
            }
            self.assertTrue(options_by_name["sessions_token_hash_unique"]["unique"])
            self.assertEqual(
                options_by_name["sessions_expiry"]["expireAfterSeconds"],
                0,
            )

        asyncio.run(scenario())
