import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from bson import ObjectId
from fastapi import HTTPException

from app.api import bookings


class BookingApiTests(unittest.TestCase):
    def test_booking_status_preserves_pending_and_cancellation_outcomes(self):
        self.assertEqual(bookings._booking_status({"initState": "INITIALIZED"}), "INITIALIZED")
        self.assertEqual(bookings._booking_status({"confirmState": "CONFIRM_REQUESTED"}), "PENDING_UNKNOWN")
        self.assertEqual(
            bookings._booking_status({"confirmState": "CONFIRMED", "cancelState": "CANCEL_REQUESTED"}),
            "PENDING_UNKNOWN",
        )
        self.assertEqual(
            bookings._booking_status({"confirmState": "CONFIRMED", "cancelState": "CANCELLED"}),
            "CANCELLED",
        )

    def test_booking_lookup_is_scoped_to_authenticated_user(self):
        async def scenario():
            user_id = ObjectId()
            repository = type("Repository", (), {})()
            repository.get_for_user = AsyncMock(return_value=None)
            with patch.object(bookings, "get_db", return_value=object()), patch.object(
                bookings, "TransportSelectionRepository", return_value=repository
            ):
                with self.assertRaises(HTTPException) as raised:
                    await bookings.get_booking("local-booking-id", {"_id": user_id})
            self.assertEqual(raised.exception.status_code, 404)
            repository.get_for_user.assert_awaited_once_with("local-booking-id", user_id)

        asyncio.run(scenario())

    def test_experience_booking_uses_search_destination_when_display_location_is_null(self):
        booking = bookings.serialize_booking({
            "selectionId": "local-booking-id",
            "kind": "experience",
            "provider": {"id": "mock-experience.example.in"},
            "providerOrder": {
                "id": "mock-experience-reference",
                "items": [{"descriptor": {"name": "Mock activity"}}],
            },
            "bookingDisplay": {"location": None},
            "criteria": {"destination": "Hyderabad", "experience_date": "2026-11-04"},
            "requestedQuantity": 2,
        })

        self.assertEqual(booking["display"]["location"], "Hyderabad")
        self.assertEqual(booking["display"]["date"], "2026-11-04")

    def test_ticket_is_only_returned_for_a_currently_confirmed_order(self):
        async def scenario():
            user = {"_id": ObjectId()}
            attempt = {
                "selectionId": "local-booking-id",
                "kind": "transport",
                "state": "CONFIRMED",
                "initState": "INITIALIZED",
                "confirmState": "CONFIRMED",
                "provider": {"id": "mock-bus.example"},
                "providerOrder": {
                    "id": "mock-provider-reference",
                    "provider": {"descriptor": {"name": "Mock Bus"}},
                    "items": [{"descriptor": {"name": "Mock service"}}],
                    "quote": {"price": {"currency": "INR", "value": "450"}},
                },
                "confirmedProviderResponse": {},
                "bookingDisplay": {"departureCity": "Vijayawada", "arrivalCity": "Hyderabad", "date": "2026-11-04"},
                "requestedQuantity": 1,
                "initDetails": {
                    "travellers": [{"name": "Example Passenger"}],
                    "contact_email": "passenger@example.com",
                    "contact_phone": "9000000000",
                },
            }
            repository = type("Repository", (), {})()
            repository.get_for_user = AsyncMock(return_value=attempt)
            with patch.object(bookings, "get_db", return_value=object()), patch.object(
                bookings, "TransportSelectionRepository", return_value=repository
            ):
                ticket = await bookings.download_mock_ticket("local-booking-id", user)
                self.assertIn("Academic prototype", ticket.body.decode())
                self.assertIn("mock-provider-reference", ticket.body.decode())
                attempt["cancelState"] = "CANCELLED"
                with self.assertRaises(HTTPException) as raised:
                    await bookings.download_mock_ticket("local-booking-id", user)
                self.assertEqual(raised.exception.status_code, 409)
                attempt["cancelState"] = None
                attempt["confirmState"] = "CONFIRM_REQUESTED"
                with self.assertRaises(HTTPException) as raised:
                    await bookings.download_mock_ticket("local-booking-id", user)
                self.assertEqual(raised.exception.status_code, 409)
                attempt["confirmState"] = "CONFIRMED"
                attempt["cancelState"] = "CANCEL_REQUESTED"
                with self.assertRaises(HTTPException) as raised:
                    await bookings.download_mock_ticket("local-booking-id", user)
            self.assertEqual(raised.exception.status_code, 409)

        asyncio.run(scenario())


if __name__ == "__main__":
    unittest.main()
