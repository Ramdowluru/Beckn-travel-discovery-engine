import json
import sys
import unittest
from pathlib import Path

from app.services.transport_normalizer import normalize_transport_callbacks

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from mock_providers.common.beckn_converter import build_on_search  # noqa: E402


def callback_for_inventory(directory: str, origin: str, destination: str) -> dict:
    with (ROOT / "mock_providers" / directory / "data.json").open(encoding="utf-8") as file:
        inventory = json.load(file)
    request = {
        "context": {
            "domain": "TRV",
            "action": "search",
            "transaction_id": f"test-{directory}",
            "message_id": f"message-{directory}",
        },
        "message": {
            "intent": {
                "fulfillment": {
                    "stops": [
                        {"type": "START", "location": {"descriptor": {"name": origin}}},
                        {"type": "END", "location": {"descriptor": {"name": destination}}},
                    ],
                    "start": {"time": {"range": {"start": "2026-10-24T00:00:00Z"}}},
                },
                "tags": [],
            },
        },
    }
    return build_on_search(inventory, request)


def callback_with_travellers(directory: str, travellers: int) -> dict:
    callback = callback_for_inventory(directory, "Vijayawada", "Hyderabad")
    request = {
        "context": callback["context"],
        "message": {
            "intent": {
                "fulfillment": {
                    "stops": [
                        {"type": "START", "location": {"descriptor": {"name": "Vijayawada"}}},
                        {"type": "END", "location": {"descriptor": {"name": "Hyderabad"}}},
                    ],
                    "start": {"time": {"range": {"start": "2026-10-24T00:00:00Z"}}},
                },
                "tags": [
                    {
                        "descriptor": {"code": "NUM_TRAVELERS"},
                        "list": [
                            {"descriptor": {"code": "COUNT"}, "value": str(travellers)},
                        ],
                    },
                ],
            },
        },
    }
    with (ROOT / "mock_providers" / directory / "data.json").open(encoding="utf-8") as file:
        inventory = json.load(file)
    return build_on_search(inventory, request)


class TransportNormalizerTests(unittest.TestCase):
    def test_converter_callbacks_map_bus_train_and_flight(self):
        callbacks = [
            ("mock_bus", "Vijayawada", "Hyderabad", "Bus", "BUS-001", 450),
            ("mock_train", "Vijayawada", "Hyderabad", "Train", "TRN-001", 240),
            ("mock_flight", "Vijayawada", "Hyderabad", "Flight", "FLT-001", 3200),
        ]
        for directory, origin, destination, mode, item_id, price in callbacks:
            with self.subTest(directory=directory):
                result = normalize_transport_callbacks([
                    callback_for_inventory(directory, origin, destination),
                ])
                offer = next(item for item in result if item["id"].endswith(f":{item_id}"))
                self.assertEqual(offer["type"], mode)
                self.assertEqual(offer["departureCity"], origin)
                self.assertEqual(offer["arrivalCity"], destination)
                expected_departure = {"mock_bus": "06:00", "mock_train": "05:45", "mock_flight": "07:20"}[directory]
                self.assertEqual(offer["departure"], expected_departure)
                self.assertTrue(offer["arrival"])
                self.assertEqual(offer["priceNum"], price)
                self.assertEqual(offer["currency"], "INR")
                self.assertEqual(offer["unitPrice"], price)
                self.assertEqual(offer["totalPrice"], price)
                self.assertEqual(offer["travellerCount"], 1)

    def test_decimal_fare_is_multiplied_safely_for_multiple_travellers(self):
        payload = callback_for_inventory("mock_bus", "Vijayawada", "Hyderabad")
        item = payload["message"]["catalog"]["providers"][0]["items"][0]
        item["price"]["value"] = "123.45"

        offer = normalize_transport_callbacks([payload], 2)[0]

        self.assertEqual(offer["unitPrice"], 123.45)
        self.assertEqual(offer["totalPrice"], 246.90)
        self.assertEqual(offer["travellerCount"], 2)

    def test_missing_duration_is_derived_and_no_stops_are_invented(self):
        payload = callback_for_inventory("mock_flight", "Vijayawada", "Hyderabad")
        item = payload["message"]["catalog"]["providers"][0]["items"][0]
        payload["message"]["catalog"]["providers"][0]["fulfillments"][0].pop("duration", None)
        result = normalize_transport_callbacks([payload])

        offer = next(item for item in result if item["id"].endswith(":FLT-001"))
        self.assertEqual(offer["duration"], "0h 55m")
        self.assertEqual(offer["stops"], "")
        self.assertEqual(offer["amenities"], [])
        self.assertEqual(offer["cancellation"], "")

    def test_timezone_aware_overnight_and_over_24_hour_duration(self):
        payload = callback_for_inventory("mock_bus", "Vijayawada", "Hyderabad")
        item = payload["message"]["catalog"]["providers"][0]["items"][0]
        fulfillment = payload["message"]["catalog"]["providers"][0]["fulfillments"][0]
        fulfillment["stops"][0]["time"]["timestamp"] = "2026-10-24T23:30:00Z"
        fulfillment["stops"][1]["time"]["timestamp"] = "2026-10-25T01:15:00+00:00"
        fulfillment.pop("duration", None)

        offer = normalize_transport_callbacks([payload])[0]

        self.assertEqual(offer["departure"], "05:00")
        self.assertEqual(offer["arrival"], "06:45")
        self.assertEqual(offer["departureDate"], "2026-10-25")
        self.assertEqual(offer["arrivalDate"], "2026-10-25")
        self.assertEqual(offer["duration"], "1h 45m")

        fulfillment["stops"][1]["time"]["timestamp"] = "2026-10-26T01:15:00+00:00"
        offer = normalize_transport_callbacks([payload])[0]
        self.assertEqual(offer["duration"], "25h 45m")

    def test_invalid_timestamps_are_safe(self):
        payload = callback_for_inventory("mock_bus", "Vijayawada", "Hyderabad")
        item = payload["message"]["catalog"]["providers"][0]["items"][0]
        fulfillment = payload["message"]["catalog"]["providers"][0]["fulfillments"][0]
        fulfillment["stops"][0]["time"]["timestamp"] = "not-a-timestamp"
        fulfillment.pop("duration", None)

        offer = normalize_transport_callbacks([payload])[0]

        self.assertEqual(offer["departure"], "")
        self.assertEqual(offer["duration"], "")

    def test_service_type_tag_is_mode_fallback(self):
        payload = callback_for_inventory("mock_bus", "Vijayawada", "Hyderabad")
        item = payload["message"]["catalog"]["providers"][0]["items"][0]
        item.pop("category_ids")

        offer = normalize_transport_callbacks([payload])[0]

        self.assertEqual(offer["type"], "Bus")

    def test_empty_and_malformed_items_are_ignored(self):
        payload = callback_for_inventory("mock_bus", "Vijayawada", "Hyderabad")
        items = payload["message"]["catalog"]["providers"][0]["items"]
        items.extend([{}, {"id": "no-price"}])

        self.assertEqual(len(normalize_transport_callbacks([payload])), 3)
        self.assertEqual(normalize_transport_callbacks([]), [])

    def test_valid_item_with_zero_availability_is_excluded(self):
        payload = callback_for_inventory("mock_bus", "Vijayawada", "Hyderabad")
        provider = payload["message"]["catalog"]["providers"][0]
        provider["items"] = [provider["items"][0]]
        item = provider["items"][0]
        item["quantity"]["available"]["count"] = 0

        self.assertEqual(normalize_transport_callbacks([payload]), [])

    def test_requested_travellers_filter_provider_inventory(self):
        payload = callback_for_inventory("mock_bus", "Vijayawada", "Hyderabad")
        items = payload["message"]["catalog"]["providers"][0]["items"]
        available_counts = [
            item["quantity"]["available"]["count"]
            for item in items
        ]
        requested = available_counts[0]
        result = normalize_transport_callbacks(
            [callback_with_travellers("mock_bus", requested)],
            requested,
        )
        self.assertEqual(len(result), sum(count >= requested for count in available_counts))

        result = normalize_transport_callbacks(
            [callback_with_travellers("mock_bus", requested + 1)],
            requested + 1,
        )
        self.assertEqual(len(result), sum(count >= requested + 1 for count in available_counts))

    def test_converter_returns_empty_catalog_when_inventory_cannot_serve_group(self):
        payload = callback_with_travellers("mock_bus", 10_000)
        provider = payload["message"]["catalog"]["providers"][0]

        self.assertEqual(provider["items"], [])
        self.assertEqual(provider["locations"], [])

    def test_missing_and_invalid_availability_are_excluded_for_requested_group(self):
        payload = callback_for_inventory("mock_bus", "Vijayawada", "Hyderabad")
        provider = payload["message"]["catalog"]["providers"][0]
        valid_item = provider["items"][0]
        missing = dict(valid_item)
        missing.pop("quantity")
        invalid = dict(valid_item)
        invalid["quantity"] = {"available": {"count": "not-a-number"}}
        provider["items"] = [missing, invalid, valid_item]

        result = normalize_transport_callbacks([payload], 1)

        self.assertEqual(len(result), 1)
        self.assertTrue(result[0]["id"].endswith(f":{valid_item['id']}"))

    def test_one_traveller_search_keeps_available_offers(self):
        payload = callback_with_travellers("mock_bus", 1)

        self.assertGreater(len(normalize_transport_callbacks([payload], 1)), 0)

    def test_same_item_id_from_two_providers_remains_distinct(self):
        bus_callback = callback_for_inventory("mock_bus", "Vijayawada", "Hyderabad")
        train_callback = callback_for_inventory("mock_train", "Vijayawada", "Hyderabad")
        train_callback["message"]["catalog"]["providers"][0]["items"][0]["id"] = "BUS-001"
        result = normalize_transport_callbacks([bus_callback, train_callback])

        ids = {item["id"] for item in result}
        self.assertIn("mock-bus:BUS-001", ids)
        self.assertIn("mock-train:BUS-001", ids)


if __name__ == "__main__":
    unittest.main()
