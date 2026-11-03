import asyncio
from datetime import datetime, timedelta, timezone
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

from bson import ObjectId
from fastapi import FastAPI, HTTPException
from starlette.requests import Request

from app.api import category_booking
from app.schemas.category_bookings import CategoryInitRequest, CategorySelectRequest
from app.services.category_order_builder import build_category_init


def _request():
    scope = {
        "type": "http",
        "method": "POST",
        "scheme": "http",
        "path": "/",
        "headers": [
            (b"origin", b"http://localhost:3000"),
            (b"cookie", b"tde_csrf=test-token"),
            (b"x-csrf-token", b"test-token"),
        ],
        "query_string": b"",
        "server": ("localhost", 8000),
        "client": ("localhost", 3000),
        "app": FastAPI(),
    }
    request = Request(scope)
    request.app.state.http_client = Mock()
    request.app.state.beckn_identity = Mock()
    request.app.state.beckn_identity.address.return_value = "http://trusted-hotel"
    return request


def _request_without_csrf():
    request = _request()
    request.scope["headers"] = [
        (name, value) for name, value in request.scope["headers"]
        if name != b"x-csrf-token"
    ]
    return request


def _hotel_snapshot():
    fulfillment = {
        "id": "hotel-room-stay",
        "type": "STAY",
        "stops": [
            {"type": "START", "time": {"timestamp": "2026-12-10T00:00:00Z"},
             "location": {"descriptor": {"name": "Hyderabad"}}},
            {"type": "END", "time": {"timestamp": "2026-12-12T00:00:00Z"},
             "location": {"descriptor": {"name": "Hyderabad"}}},
        ],
    }
    offer = {
        "_beckn": {
            "kind": "hotel",
            "bpp_id": "hotel-bpp",
            "bpp_uri": "http://untrusted-snapshot-uri",
            "provider_id": "hotel-provider",
            "item_id": "hotel-room",
            "fulfillment_id": fulfillment["id"],
            "fulfillment": fulfillment,
            "price": {"currency": "INR", "value": "2800.00"},
            "available_rooms": 4,
            "room_capacity": "2",
        },
    }
    return {"offer": offer, "query": {
        "destination": "Hyderabad",
        "check_in": "2026-12-10",
        "check_out": "2026-12-12",
        "rooms": 1,
        "guests": 2,
    }}


class CategoryBookingApiTests(IsolatedAsyncioTestCase):
    async def test_select_uses_trusted_provider_and_persists_before_dispatch(self):
        user_id = ObjectId()
        attempt = {
            "selectionId": "selection-1",
            "state": "SELECT_REQUESTED",
            "messageId": str(uuid4()),
            "provider": {"id": "hotel-bpp", "uri": "http://trusted-hotel"},
            "item": {"id": "hotel-room", "provider_id": "hotel-provider"},
            "fulfillment": _hotel_snapshot()["offer"]["_beckn"]["fulfillment"],
        }
        selected = {**attempt, "state": "SELECTED", "quote": {"price": {"currency": "INR", "value": "5600"}}}
        repository = AsyncMock()
        repository.create_or_get.return_value = attempt
        repository.claim_dispatch.return_value = attempt
        repository.get_for_user.return_value = selected
        callback_future = asyncio.get_running_loop().create_future()
        callback_future.set_result({"message": {"order": {}}})
        request = _request()
        payload = CategorySelectRequest(quantity=1)
        snapshot = _hotel_snapshot()

        with patch.object(category_booking, "_snapshot", new=AsyncMock(return_value=snapshot)), patch.object(
            category_booking, "get_db", return_value=None
        ), patch.object(
            category_booking, "TransportSelectionRepository", return_value=repository
        ), patch.object(category_booking, "start", return_value=callback_future), patch.object(
            category_booking, "signed_post", new=AsyncMock(return_value={"ack": {}})
        ) as send_request, patch.object(category_booking, "require_ack"), patch.object(
            category_booking, "validate_message"
        ):
            result = await category_booking.select_category_offer(
                "stays", "offer-1", payload, request, "transaction-1", {"_id": user_id}
            )

        self.assertEqual(result["state"], "SELECTED")
        request.app.state.beckn_identity.address.assert_called_once_with("hotel-bpp")
        request.app.state.beckn_identity.check_address.assert_called_once_with(
            "hotel-bpp", "http://untrusted-snapshot-uri"
        )
        self.assertEqual(send_request.await_args.args[1], "http://trusted-hotel/select")
        self.assertEqual(repository.create_or_get.await_args.kwargs["kind"], "hotel")
        self.assertEqual(repository.claim_dispatch.await_args.args, ("selection-1", user_id))

    async def test_status_is_scoped_to_the_authenticated_owner(self):
        repository = AsyncMock()
        repository.get_for_user.return_value = None
        with patch.object(category_booking, "get_db", return_value=None), patch.object(
            category_booking, "TransportSelectionRepository", return_value=repository
        ):
            with self.assertRaises(HTTPException) as error:
                await category_booking.get_category_selection("selection-1", {"_id": ObjectId()})
        self.assertEqual(error.exception.status_code, 404)

    async def test_init_is_scoped_to_the_authenticated_owner(self):
        repository = AsyncMock()
        repository.get_for_user.return_value = None
        payload = CategoryInitRequest(
            people=[{"name": "Participant"}],
            contact_email="guest@example.org",
            contact_phone="+10000000000",
        )
        with patch.object(category_booking, "require_browser_write"), patch.object(
            category_booking, "get_db", return_value=None
        ), patch.object(category_booking, "TransportSelectionRepository", return_value=repository):
            with self.assertRaises(HTTPException) as error:
                await category_booking.init_category_offer("selection-1", payload, _request(), {"_id": ObjectId()})
        self.assertEqual(error.exception.status_code, 404)
        repository.begin_init.assert_not_awaited()

    async def test_init_rejects_missing_csrf_before_database_access(self):
        payload = CategoryInitRequest(
            people=[{"name": "Participant"}],
            contact_email="guest@example.org",
            contact_phone="+10000000000",
        )
        with patch.object(category_booking.settings, "trusted_origins", "http://localhost:3000"):
            with self.assertRaises(HTTPException) as error:
                await category_booking.init_category_offer(
                    "selection-1", payload, _request_without_csrf(), {"_id": ObjectId()}
                )
        self.assertEqual(error.exception.status_code, 403)

    async def test_concurrent_select_claim_does_not_dispatch_twice(self):
        attempt = {
            "selectionId": "selection-1",
            "state": "SELECT_REQUESTED",
            "provider": {"id": "hotel-bpp", "uri": "http://trusted-hotel"},
            "item": {"id": "hotel-room", "provider_id": "hotel-provider"},
        }
        repository = AsyncMock()
        repository.create_or_get.return_value = attempt
        repository.claim_dispatch.return_value = None
        snapshot = _hotel_snapshot()
        with patch.object(category_booking, "_snapshot", new=AsyncMock(return_value=snapshot)), patch.object(
            category_booking, "get_db", return_value=None
        ), patch.object(
            category_booking, "TransportSelectionRepository", return_value=repository
        ), patch.object(category_booking, "signed_post", new=AsyncMock()) as send_request, patch.object(
            category_booking, "require_browser_write"
        ):
            result = await category_booking.select_category_offer(
                "stays",
                "offer-1",
                CategorySelectRequest(quantity=1),
                _request(),
                "transaction-1",
                {"_id": ObjectId()},
            )
        self.assertEqual(result["state"], "PENDING")
        send_request.assert_not_awaited()

    async def test_init_rejects_wrong_guest_count_before_dispatch(self):
        user_id = ObjectId()
        attempt = {
            "selectionId": "selection-1",
            "state": "SELECTED",
            "kind": "hotel",
            "quoteExpiresAt": datetime.now(timezone.utc) + timedelta(minutes=5),
            "criteria": {"guests": 2, "rooms": 1, "room_capacity": "2"},
        }
        repository = AsyncMock()
        repository.get_for_user.return_value = attempt
        payload = CategoryInitRequest(
            people=[{"name": "Guest One"}],
            room_assignments=[1],
            contact_email="guest@example.org",
            contact_phone="+10000000000",
        )
        with patch.object(category_booking, "require_browser_write"), patch.object(
            category_booking, "get_db", return_value=None
        ), patch.object(category_booking, "TransportSelectionRepository", return_value=repository):
            with self.assertRaises(HTTPException) as error:
                await category_booking.init_category_offer("selection-1", payload, _request(), {"_id": user_id})
        self.assertEqual(error.exception.status_code, 422)
        repository.begin_init.assert_not_awaited()

    async def test_init_rejects_expired_quote_before_dispatch(self):
        attempt = {
            "selectionId": "selection-1",
            "state": "SELECTED",
            "kind": "experience",
            "quoteExpiresAt": datetime.now(timezone.utc) - timedelta(seconds=1),
            "criteria": {"participants": 1},
        }
        repository = AsyncMock()
        repository.get_for_user.return_value = attempt
        payload = CategoryInitRequest(
            people=[{"name": "Participant"}],
            contact_email="guest@example.org",
            contact_phone="+10000000000",
        )
        with patch.object(category_booking, "require_browser_write"), patch.object(
            category_booking, "get_db", return_value=None
        ), patch.object(category_booking, "TransportSelectionRepository", return_value=repository):
            with self.assertRaises(HTTPException) as error:
                await category_booking.init_category_offer("selection-1", payload, _request(), {"_id": ObjectId()})
        self.assertEqual(error.exception.status_code, 409)
        repository.begin_init.assert_not_awaited()

    def test_init_payload_carries_the_trusted_selection_criteria(self):
        criteria = {
            "destination": "Hyderabad",
            "check_in": "2026-12-10",
            "check_out": "2026-12-12",
            "rooms": 1,
            "guests": 2,
            "fulfillment_id": "hotel-room-stay",
        }
        payload = build_category_init(
            kind="hotel",
            transaction_id=str(uuid4()),
            message_id=str(uuid4()),
            provider={"id": "hotel-bpp", "uri": "http://trusted-hotel"},
            item={"id": "hotel-room", "provider_id": "hotel-provider"},
            fulfillment=_hotel_snapshot()["offer"]["_beckn"]["fulfillment"],
            quantity=1,
            quote={"price": {"currency": "INR", "value": "5600"}},
            quote_expires_at="2026-12-10T00:10:00Z",
            details={
                "people": [{"name": "Guest One"}, {"name": "Guest Two"}],
                "room_assignments": [1, 1],
                "contact_email": "guest@example.org",
                "contact_phone": "+10000000000",
            },
            criteria=criteria,
        )
        tags = payload["message"]["order"]["tags"]
        booking = next(tag for tag in tags if tag["descriptor"]["code"] == "TDE_HOTEL_BOOKING")
        values = {entry["descriptor"]["code"]: entry["value"] for entry in booking["list"]}
        self.assertEqual(values["FULFILLMENT_ID"], "hotel-room-stay")
        self.assertEqual(values["CHECK_IN"], "2026-12-10")
        self.assertEqual(values["CHECK_OUT"], "2026-12-12")
