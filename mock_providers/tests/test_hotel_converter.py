import json
import asyncio
import unittest
from pathlib import Path
from types import SimpleNamespace

import httpx
from unittest.mock import patch

from common.server import create_hotel_app
from mock_hotel.hotel_converter import build_hotel_on_search


ROOT = Path(__file__).parents[1]
DATA = json.loads((ROOT / "mock_hotel" / "data.json").read_text(encoding="utf-8"))


def request(destination="Hyderabad", rooms=1, guests=2):
    return {
        "context": {
            "transaction_id": "tx-hotel-1",
            "bap_uri": "http://localhost:8000",
            "message_id": "msg-1",
        },
        "message": {
            "intent": {
                "fulfillment": {
                    "location": {"descriptor": {"name": destination}},
                    "start": {"time": {"range": {"start": "2026-10-28T00:00:00Z"}}},
                    "end": {"time": {"range": {"end": "2026-10-30T00:00:00Z"}}},
                },
                "tags": [
                    {"descriptor": {"code": "ROOMS"}, "list": [
                        {"descriptor": {"code": "COUNT"}, "value": str(rooms)}
                    ]},
                    {"descriptor": {"code": "GUESTS"}, "list": [
                        {"descriptor": {"code": "COUNT"}, "value": str(guests)}
                    ]},
                ],
            }
        },
    }


class HotelConverterTests(unittest.TestCase):
    def test_matches_destination_and_returns_each_eligible_room(self):
        callback = build_hotel_on_search(DATA, request())
        items = callback["message"]["catalog"]["providers"][0]["items"]
        self.assertGreater(len(items), 0)
        self.assertEqual(callback["context"]["transaction_id"], "tx-hotel-1")
        self.assertEqual(callback["context"]["action"], "on_search")
        self.assertTrue(all(item["id"].startswith("mock-hotel.example.in:") for item in items))
        self.assertTrue(all(item["quantity"]["requested"]["guests"] == 2 for item in items))

    def test_filters_by_room_capacity_and_room_availability(self):
        callback = build_hotel_on_search(DATA, request(rooms=2, guests=8))
        items = callback["message"]["catalog"]["providers"][0]["items"]
        self.assertEqual(
            [item["id"] for item in items],
            ["mock-hotel.example.in:HTL-002:HTL-002-STE"],
        )

    def test_nonmatching_destination_returns_valid_empty_catalog(self):
        callback = build_hotel_on_search(DATA, request(destination="Chennai"))
        providers = callback["message"]["catalog"]["providers"]
        self.assertEqual(providers[0]["items"], [])
        self.assertEqual(callback["context"]["transaction_id"], "tx-hotel-1")

    def test_search_does_not_mutate_static_inventory(self):
        before = json.dumps(DATA, sort_keys=True)
        build_hotel_on_search(DATA, request(rooms=2, guests=4))
        self.assertEqual(json.dumps(DATA, sort_keys=True), before)

    def test_http_search_rejects_unsigned_requests(self):
        async def scenario():
            with patch.dict("os.environ", {"DELAY_SECONDS": "0"}):
                app = create_hotel_app(ROOT / "mock_hotel")

            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://hotel") as client:
                response = await client.post("/search", json=request())
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()["error"]["message"], "Invalid or unauthenticated search")

        asyncio.run(scenario())
