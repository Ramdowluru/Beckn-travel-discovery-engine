import unittest
from datetime import date

from app.services.hotel_normalizer import normalize_hotel_callbacks


class HotelNormalizerTests(unittest.TestCase):
    def test_nightly_and_total_prices_use_requested_rooms_and_nights(self):
        callback = {
            "context": {"bpp_id": "hotel-bpp", "action": "on_search"},
            "message": {"catalog": {"providers": [{
                "id": "hotel-provider",
                "descriptor": {"name": "StayNest"},
                "locations": [{"id": "loc", "descriptor": {"name": "Hyderabad"}}],
                "fulfillments": [{"id": "stay", "type": "STAY"}],
                "items": [{
                    "id": "room",
                    "descriptor": {"name": "Deluxe", "short_desc": "A room"},
                    "location_ids": ["loc"],
                    "fulfillment_ids": ["stay"],
                    "price": {"currency": "INR", "value": "2800.00"},
                    "tags": [{"list": [
                        {"descriptor": {"code": "RATING"}, "value": "4.4"},
                        {"descriptor": {"code": "AMENITIES"}, "value": "wifi,parking"},
                    ]}],
                }],
            }]}},
        }
        result = normalize_hotel_callbacks(
            [callback],
            date(2026, 10, 28),
            date(2026, 10, 30),
            2,
            {"hotel-bpp"},
        )
        self.assertEqual(result[0]["pricePerNight"], "INR 2800.00")
        self.assertEqual(result[0]["totalPrice"], "INR 11200.00")
        self.assertEqual(result[0]["nights"], 2)
        self.assertEqual(result[0]["rooms"], 2)
