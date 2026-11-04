import asyncio
import os
import unittest
from datetime import date, datetime, timezone
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "tde_test")
os.environ.setdefault("GATEWAY_URL", "http://localhost:9000")
os.environ.setdefault("BAP_ID", "test-bap")
os.environ.setdefault("BAP_URI", "http://localhost:8000")

from bson import ObjectId
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from starlette.requests import Request

from app.api import trips
from app.dependencies.auth import get_current_user
from app.main import app
from app.repositories.trips import TripRepository
from app.schemas.trips import TripCreateRequest, TripUpdateRequest


class FakeCursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, *_args):
        return self

    async def to_list(self, length):
        return self.documents[:length]


class FakeTripCollection:
    def __init__(self):
        self.documents = []
        self.indexes = []
        self.lock = asyncio.Lock()

    async def create_index(self, keys, **options):
        self.indexes.append((keys, options))
        return options.get("name", "index")

    async def insert_one(self, document):
        self.documents.append(document)

    async def find_one(self, query):
        return next((doc for doc in self.documents if self._matches(doc, query)), None)

    def find(self, query):
        return FakeCursor([doc for doc in self.documents if self._matches(doc, query)])

    async def find_one_and_update(self, query, update, return_document=None):
        async with self.lock:
            document = next((doc for doc in self.documents if self._matches(doc, query)), None)
            if document is None:
                return None
            for key, value in update.get("$set", {}).items():
                document[key] = value
            for key, value in update.get("$addToSet", {}).items():
                if value not in document.setdefault(key, []):
                    document[key].append(value)
            for key, value in update.get("$pull", {}).items():
                document[key] = [entry for entry in document.get(key, []) if entry != value]
            return dict(document)

    @staticmethod
    def _matches(document, query):
        for key, value in query.items():
            if key == "$or":
                if not any(FakeTripCollection._matches(document, clause) for clause in value):
                    return False
            elif isinstance(value, dict) and "$ne" in value:
                if value["$ne"] in document.get(key, []):
                    return False
            elif isinstance(value, dict) and "$gte" in value:
                if document.get(key) < value["$gte"]:
                    return False
            elif isinstance(value, dict) and "$lte" in value:
                if document.get(key) > value["$lte"]:
                    return False
            elif key == "bookingIds" and isinstance(value, dict) and "$in" in value:
                if not any(entry in document.get(key, []) for entry in value["$in"]):
                    return False
            elif document.get(key) != value:
                return False
        return True


class FakeDatabase:
    def __init__(self):
        self.trips = FakeTripCollection()
        self.selection_attempts = []

    def __getitem__(self, name):
        if name == "trips":
            return self.trips
        if name == "transport_selection_attempts":
            return FakeCursorCollection(self.selection_attempts)
        if name == "booking_status_actions":
            return FakeTripCollection()
        raise AssertionError(f"Unexpected collection access: {name}")


class FakeCursorCollection:
    def __init__(self, documents):
        self.documents = documents

    async def find_one(self, query):
        return next((
            document for document in self.documents
            if document.get("userId") == query["userId"]
            and document.get("selectionId") == query["selectionId"]
        ), None)

    def find(self, query):
        selection_ids = query["selectionId"]["$in"]
        return FakeCursor([
            document for document in self.documents
            if document.get("userId") == query["userId"]
            and document.get("selectionId") in selection_ids
        ])


def _request(with_csrf=True):
    headers = [(b"origin", b"http://localhost:3000")]
    if with_csrf:
        headers.extend([(b"cookie", b"tde_csrf=test-token"), (b"x-csrf-token", b"test-token")])
    return Request({
        "type": "http",
        "method": "POST",
        "scheme": "http",
        "path": "/api/trips",
        "headers": headers,
        "query_string": b"",
        "server": ("localhost", 8000),
        "client": ("localhost", 3000),
        "app": FastAPI(),
    })


class TripRepositoryTests(IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = FakeDatabase()
        self.repository = TripRepository(self.db)
        self.user_id = ObjectId()

    async def test_persistence_indexes_and_owner_scoped_reads(self):
        await self.repository.ensure_indexes()
        trip = await self.repository.create(
            user_id=self.user_id,
            title="Family weekend",
            destination="Hyderabad",
            start_date=date(2026, 12, 10),
            end_date=date(2026, 12, 12),
        )
        self.assertIsInstance(trip["createdAt"], datetime)
        self.assertEqual(trip["startDate"], "2026-12-10")
        self.assertEqual(await self.repository.get_for_user(self.user_id, trip["tripId"]), trip)
        self.assertIsNone(await self.repository.get_for_user(ObjectId(), trip["tripId"]))
        self.assertEqual(len(await self.repository.list_for_user(self.user_id)), 1)
        self.assertTrue(any(options.get("unique") for _, options in self.db.trips.indexes))

    async def test_atomic_membership_add_and_remove_are_idempotent(self):
        trip = await self.repository.create(
            user_id=self.user_id,
            title="Weekend",
            destination="Hyderabad",
            start_date=date(2026, 12, 10),
            end_date=date(2026, 12, 12),
        )
        await asyncio.gather(*[
            self.repository.add_booking_reference(self.user_id, trip["tripId"], "booking-1")
            for _ in range(20)
        ])
        stored = await self.repository.get_for_user(self.user_id, trip["tripId"])
        self.assertEqual(stored["bookingIds"], ["booking-1"])
        await self.repository.add_booking_reference(self.user_id, trip["tripId"], "booking-2")
        stored = await self.repository.get_for_user(self.user_id, trip["tripId"])
        self.assertEqual(set(stored["bookingIds"]), {"booking-1", "booking-2"})
        await self.repository.remove_booking_reference(self.user_id, trip["tripId"], "booking-1")
        await self.repository.remove_booking_reference(self.user_id, trip["tripId"], "booking-1")
        stored = await self.repository.get_for_user(self.user_id, trip["tripId"])
        self.assertEqual(stored["bookingIds"], ["booking-2"])

    async def test_update_and_membership_operations_require_owner_scoped_trip(self):
        trip = await self.repository.create(
            user_id=self.user_id,
            title="Weekend",
            destination="Hyderabad",
            start_date=date(2026, 12, 10),
            end_date=date(2026, 12, 12),
        )
        self.assertIsNone(await self.repository.update_for_user(
            ObjectId(), trip["tripId"], {"title": "Changed"}
        ))
        self.assertIsNone(await self.repository.add_booking_reference(
            ObjectId(), trip["tripId"], "booking-1"
        ))
        self.assertIsNone(await self.repository.remove_booking_reference(
            ObjectId(), trip["tripId"], "booking-1"
        ))
        self.assertIsNone(await self.repository.update_for_user(
            self.user_id,
            trip["tripId"],
            {"end_date": date(2026, 12, 9)},
        ))


class TripSchemaTests(unittest.TestCase):
    def test_create_trims_and_validates_trip_metadata(self):
        trip = TripCreateRequest(
            title="  Family trip  ",
            destination="  Hyderabad ",
            start_date="2026-12-10",
            end_date="2026-12-12",
        )
        self.assertEqual(trip.title, "Family trip")
        self.assertEqual(trip.destination, "Hyderabad")
        self.assertEqual(trip.start_date, date(2026, 12, 10))
        with self.assertRaises(ValueError):
            TripCreateRequest(
                title=" ",
                destination="Hyderabad",
                start_date="2026-12-10",
                end_date="2026-12-12",
            )
        with self.assertRaises(ValueError):
            TripCreateRequest(
                title="Trip",
                destination="Hyderabad",
                start_date="2026-12-13",
                end_date="2026-12-12",
            )

    def test_partial_update_requires_valid_fields_and_ordered_dates(self):
        self.assertEqual(TripUpdateRequest(title="  Changed ").title, "Changed")
        with self.assertRaises(ValueError):
            TripUpdateRequest(title=" ")
        with self.assertRaises(ValueError):
            TripUpdateRequest(start_date="2026-12-13", end_date="2026-12-12")
        with self.assertRaises(ValueError):
            TripUpdateRequest(title=None)


class TripApiTests(IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.original_overrides = app.dependency_overrides.copy()

    async def asyncTearDown(self):
        app.dependency_overrides.clear()
        app.dependency_overrides.update(self.original_overrides)

    async def test_create_requires_csrf_before_database_write(self):
        payload = TripCreateRequest(
            title="Weekend",
            destination="Hyderabad",
            start_date="2026-12-10",
            end_date="2026-12-12",
        )
        with patch.object(trips, "TripRepository") as repository:
            with self.assertRaises(HTTPException) as raised:
                await trips.create_trip(payload, _request(with_csrf=False), {"_id": ObjectId()})
        self.assertEqual(raised.exception.status_code, 403)
        repository.assert_not_called()

    async def test_booking_membership_requires_owned_booking_and_owned_trip(self):
        user_id = ObjectId()
        trip = {
            "tripId": "trip-1",
            "userId": user_id,
            "title": "Weekend",
            "destination": "Hyderabad",
            "startDate": "2026-12-10",
            "endDate": "2026-12-12",
            "bookingIds": [],
            "createdAt": datetime.now(timezone.utc),
            "updatedAt": datetime.now(timezone.utc),
        }
        trip_repository = AsyncMock()
        trip_repository.get_for_user.return_value = trip
        trip_repository.add_booking_reference.return_value = {**trip, "bookingIds": ["booking-1"]}
        booking_repository = AsyncMock()
        booking_repository.get_for_user.return_value = {
            "selectionId": "booking-1", "userId": user_id, "initState": "INITIALIZED",
            "confirmState": "CONFIRMED",
        }
        booking_repository.get_many_for_user.return_value = [{
            "selectionId": "booking-1",
            "kind": "transport",
            "provider": {},
            "providerOrder": {"id": "provider-order", "items": []},
            "initState": "INITIALIZED",
            "confirmState": "CONFIRMED",
        }]

        with patch.object(trips, "get_db", return_value=object()), patch.object(
            trips, "TripRepository", return_value=trip_repository
        ), patch.object(
            trips, "TransportSelectionRepository", return_value=booking_repository
        ), patch.object(trips, "serialize_booking", wraps=trips.serialize_booking) as serialize:
            response = await trips.add_booking_to_trip(
                "trip-1", "booking-1", _request(), {"_id": user_id}
            )

        self.assertEqual(response.bookings[0].status, "CONFIRMED")
        trip_repository.add_booking_reference.assert_awaited_once_with(user_id, "trip-1", "booking-1")
        serialize.assert_called_once()

        booking_repository.get_for_user.return_value = None
        with patch.object(trips, "get_db", return_value=object()), patch.object(
            trips, "TripRepository", return_value=trip_repository
        ), patch.object(trips, "TransportSelectionRepository", return_value=booking_repository):
            with self.assertRaises(HTTPException) as raised:
                await trips.add_booking_to_trip("trip-1", "foreign-booking", _request(), {"_id": user_id})
        self.assertEqual(raised.exception.status_code, 404)
        trip_repository.add_booking_reference.assert_awaited_once()

    async def test_detail_hydrates_current_booking_status_and_marks_missing_reference(self):
        user_id = ObjectId()
        trip_document = {
            "tripId": "trip-1",
            "title": "Weekend",
            "destination": "Hyderabad",
            "startDate": "2026-12-10",
            "endDate": "2026-12-12",
            "bookingIds": ["booking-1", "deleted-booking"],
            "createdAt": datetime.now(timezone.utc),
            "updatedAt": datetime.now(timezone.utc),
        }
        trip_repository = AsyncMock()
        trip_repository.get_for_user.return_value = trip_document
        booking_repository = AsyncMock()
        booking_repository.get_many_for_user.return_value = [{
            "selectionId": "booking-1",
            "kind": "hotel",
            "provider": {"id": "hotel-bpp"},
            "providerOrder": {
                "id": "provider-order",
                "items": [{"descriptor": {"name": "Hotel stay"}}],
                "quote": {"price": {"currency": "INR", "value": "1000"}},
            },
            "bookingDisplay": {"name": "Hotel stay"},
            "criteria": {"destination": "Hyderabad"},
            "requestedQuantity": 1,
            "initState": "INITIALIZED",
            "confirmState": "CONFIRM_REQUESTED",
        }]

        with patch.object(trips, "get_db", return_value=object()), patch.object(
            trips, "TripRepository", return_value=trip_repository
        ), patch.object(
            trips, "TransportSelectionRepository", return_value=booking_repository
        ):
            response = await trips.get_trip("trip-1", {"_id": user_id})

        self.assertEqual(response.bookings[0].status, "PENDING_UNKNOWN")
        self.assertEqual(response.bookings[0].booking["provider_order_id"], "provider-order")
        self.assertEqual(response.bookings[1].status, "UNAVAILABLE")
        self.assertIsNone(response.bookings[1].booking)
        booking_repository.get_many_for_user.assert_awaited_once_with(
            user_id=user_id, selection_ids=["booking-1", "deleted-booking"]
        )

    async def test_edit_validates_resulting_date_range_and_is_owner_scoped(self):
        user_id = ObjectId()
        trip_repository = AsyncMock()
        trip_repository.get_for_user.return_value = {
            "tripId": "trip-1",
            "startDate": "2026-12-10",
            "endDate": "2026-12-12",
        }
        with patch.object(trips, "get_db", return_value=object()), patch.object(
            trips, "TripRepository", return_value=trip_repository
        ):
            with self.assertRaises(HTTPException) as raised:
                await trips.update_trip(
                    "trip-1",
                    TripUpdateRequest(start_date="2026-12-13"),
                    _request(),
                    {"_id": user_id},
                )
        self.assertEqual(raised.exception.status_code, 422)
        trip_repository.update_for_user.assert_not_awaited()

        trip_repository.get_for_user.return_value = None
        with patch.object(trips, "get_db", return_value=object()), patch.object(
            trips, "TripRepository", return_value=trip_repository
        ):
            with self.assertRaises(HTTPException) as raised:
                await trips.update_trip(
                    "other-user-trip",
                    TripUpdateRequest(title="Changed"),
                    _request(),
                    {"_id": user_id},
                )
        self.assertEqual(raised.exception.status_code, 404)

    async def test_registered_http_flow_persists_and_hydrates_trip_membership(self):
        database = FakeDatabase()
        self.user = {"_id": ObjectId()}
        app.dependency_overrides[get_current_user] = lambda: self.user
        with patch.object(trips, "get_db", return_value=database):
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://test",
            ) as client:
                client.cookies.set("tde_csrf", "csrf-value")
                headers = {
                    "Origin": "http://localhost:3000",
                    "X-CSRF-Token": "csrf-value",
                }
                response = await client.post(
                    "/api/trips",
                    headers=headers,
                    json={
                        "title": "Weekend",
                        "destination": "Hyderabad",
                        "start_date": "2026-12-10",
                        "end_date": "2026-12-12",
                    },
                )
                self.assertEqual(response.status_code, 201)
                trip_id = response.json()["id"]

                self.assertEqual((await client.get("/api/trips")).status_code, 200)
                self.assertEqual((await client.get(f"/api/trips/{trip_id}")).status_code, 200)
                patch_response = await client.patch(
                    f"/api/trips/{trip_id}",
                    headers=headers,
                    json={"title": "Updated weekend"},
                )
                self.assertEqual(patch_response.status_code, 200)
                self.assertEqual(patch_response.json()["title"], "Updated weekend")

                database.selection_attempts.append({
                    "selectionId": "booking-1",
                    "userId": self.user["_id"],
                    "kind": "transport",
                    "provider": {"id": "bus-bpp"},
                    "providerOrder": {
                        "id": "provider-order-1",
                        "items": [{"descriptor": {"name": "Bus service"}}],
                    },
                    "initState": "INITIALIZED",
                    "confirmState": "CONFIRMED",
                })
                add_response = await client.put(
                    f"/api/trips/{trip_id}/bookings/booking-1",
                    headers=headers,
                )
                self.assertEqual(add_response.status_code, 200)
                self.assertEqual(add_response.json()["bookings"][0]["status"], "CONFIRMED")

                database.selection_attempts[0]["cancelState"] = "CANCELLED"
                refreshed = await client.get(f"/api/trips/{trip_id}")
                self.assertEqual(refreshed.json()["bookings"][0]["status"], "CANCELLED")

                remove_path = f"/api/trips/{trip_id}/bookings/booking-1"
                self.assertEqual((await client.delete(
                    remove_path, headers=headers
                )).status_code, 200)
                repeated_remove = await client.delete(
                    remove_path, headers=headers
                )
                self.assertEqual(repeated_remove.status_code, 200)
                self.assertEqual(repeated_remove.json()["bookings"], [])

                rejected_write = await client.post(
                    "/api/trips",
                    headers={"Origin": "http://localhost:3000"},
                    json={
                        "title": "Bad csrf",
                        "destination": "Hyderabad",
                        "start_date": "2026-12-10",
                        "end_date": "2026-12-12",
                    },
                )
                self.assertEqual(rejected_write.status_code, 403)

                self.user = {"_id": ObjectId()}
                foreign_lookup = await client.get(f"/api/trips/{trip_id}")
                self.assertEqual(foreign_lookup.status_code, 404)


if __name__ == "__main__":
    unittest.main()
