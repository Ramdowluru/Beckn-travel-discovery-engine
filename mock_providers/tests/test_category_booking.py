import json
import tempfile
from copy import deepcopy
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from common.order_store import get_initialized_order, save_initialized_order
from mock_experience.experience_converter import (
    build_experience_on_init,
    build_experience_on_search,
    build_experience_on_select,
)
from mock_hotel.hotel_converter import (
    build_hotel_on_init,
    build_hotel_on_search,
    build_hotel_on_select,
)
from protocol.contracts import prepare_order_validation, validate_message


ROOT = Path(__file__).parents[1]
HOTEL = json.loads((ROOT / "mock_hotel" / "data.json").read_text(encoding="utf-8"))
EXPERIENCE = json.loads((ROOT / "mock_experience" / "data.json").read_text(encoding="utf-8"))
FUTURE_DATE = date.today() + timedelta(days=30)


def context(action, transaction_id, message_id, provider):
    return {
        "domain": "TRV",
        "version": "1.1.0",
        "ttl": "PT30S",
        "action": action,
        "bap_id": "bap.example.in",
        "bap_uri": "http://localhost:8000",
        "bpp_id": provider["bpp_id"],
        "bpp_uri": provider["bpp_uri"],
        "transaction_id": transaction_id,
        "message_id": message_id,
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
    }


def hotel_search(rooms=1, guests=2):
    return {
        "context": {"transaction_id": str(uuid4()), "bap_uri": "http://localhost:8000"},
        "message": {"intent": {
            "fulfillment": {
                "location": {"descriptor": {"name": "Hyderabad"}},
                "start": {"time": {"range": {"start": f"{FUTURE_DATE.isoformat()}T00:00:00Z"}}},
                "end": {"time": {"range": {"end": f"{(FUTURE_DATE + timedelta(days=2)).isoformat()}T00:00:00Z"}}},
            },
            "tags": [
                {"descriptor": {"code": "ROOMS"}, "list": [{"descriptor": {"code": "COUNT"}, "value": str(rooms)}]},
                {"descriptor": {"code": "GUESTS"}, "list": [{"descriptor": {"code": "COUNT"}, "value": str(guests)}]},
            ],
        }},
    }


def experience_search():
    return {
        "context": {"transaction_id": str(uuid4()), "bap_uri": "http://localhost:8000"},
        "message": {"intent": {
            "fulfillment": {
                "location": {"descriptor": {"name": "Hyderabad"}},
                "start": {"time": {"range": {
                    "start": f"{FUTURE_DATE.isoformat()}T00:00:00Z",
                    "end": f"{FUTURE_DATE.isoformat()}T23:59:59Z",
                }}},
            },
            "tags": [{
                "descriptor": {"code": "NUM_PARTICIPANTS"},
                "list": [{"descriptor": {"code": "COUNT"}, "value": "2"}],
            }],
        }},
    }


def select_request(kind, provider, transaction_id, item, fulfillment, quantity, criteria):
    return {
        "context": context("select", transaction_id, str(uuid4()), provider),
        "message": {"order": {
            "provider": {"id": provider["id"]},
            "items": [{"id": item["id"], "quantity": {"selected": {"count": quantity}}}],
            "fulfillments": [fulfillment],
            "tags": [{
                "descriptor": {"code": f"TDE_{kind.upper()}_BOOKING"},
                "list": [
                    {"descriptor": {"code": key.upper()}, "value": str(value)}
                    for key, value in criteria.items()
                ],
            }],
        }},
    }


def init_request(kind, provider, selected, transaction_id, expiry=None, people_count=None):
    selected_order = selected["message"]["order"]
    quantity = selected_order["items"][0]["quantity"]["selected"]["count"]
    group = "TDE_GUESTS" if kind == "hotel" else "TDE_PARTICIPANTS"
    people = []
    count = people_count if people_count is not None else (quantity if kind == "experience" else 2)
    for index in range(count):
        people.append({"descriptor": {"code": "NAME"}, "value": f"Guest {index + 1}"})
        people.append({"descriptor": {"code": "GENDER"}, "value": "female"})
        if kind == "hotel":
            people.append({"descriptor": {"code": "ROOM"}, "value": "1"})
    tags = [
        *selected_order.get("tags", []),
        {"descriptor": {"code": group}, "list": people},
        {"descriptor": {"code": "TDE_QUOTE"}, "list": [{
            "descriptor": {"code": "EXPIRES_AT"},
            "value": expiry or (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat().replace("+00:00", "Z"),
        }]},
    ]
    return {
        "context": context("init", transaction_id, str(uuid4()), provider),
        "message": {"order": {
            "provider": selected_order["provider"],
            "items": selected_order["items"],
            "fulfillments": selected_order["fulfillments"],
            "quote": selected_order["quote"],
            "billing": {"name": "Guest 1", "email": "guest@example.test", "phone": "+12345678901"},
            "tags": tags,
        }},
    }


class CategoryBookingConverterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        prepare_order_validation()

    def test_hotel_select_and_init_produce_valid_correlated_callbacks(self):
        tx = str(uuid4())
        discovery = build_hotel_on_search(HOTEL, hotel_search())
        provider = HOTEL["provider"]
        catalog_provider = discovery["message"]["catalog"]["providers"][0]
        item = catalog_provider["items"][0]
        fulfillment = next(
            entry for entry in catalog_provider["fulfillments"]
            if entry["id"] == item["fulfillment_ids"][0]
        )
        select = select_request("hotel", provider, tx, item, fulfillment, 1, {
            "destination": "Hyderabad",
            "check_in": FUTURE_DATE.isoformat(),
            "check_out": (FUTURE_DATE + timedelta(days=2)).isoformat(),
            "rooms": 1,
            "guests": 2,
            "fulfillment_id": fulfillment["id"],
        })
        validate_message(select, "select")
        selected = build_hotel_on_select(HOTEL, select)
        validate_message(selected, "on_select")
        init = init_request("hotel", provider, selected, tx)
        validate_message(init, "init")
        initialized = build_hotel_on_init(HOTEL, init)
        validate_message(initialized, "on_init")
        self.assertEqual(initialized["context"]["transaction_id"], tx)
        self.assertEqual(initialized["context"]["message_id"], init["context"]["message_id"])
        self.assertEqual(initialized["message"]["order"]["state"], "INITIALIZED")
        self.assertTrue(initialized["message"]["order"]["id"])
        returned_guests = next(
            tag for tag in initialized["message"]["order"]["tags"]
            if tag["descriptor"]["code"] == "TDE_GUESTS"
        )
        self.assertIn({"descriptor": {"code": "GENDER"}, "value": "female"}, returned_guests["list"])

        invalid_gender = json.loads(json.dumps(init))
        guest_tag = next(
            tag for tag in invalid_gender["message"]["order"]["tags"]
            if tag["descriptor"]["code"] == "TDE_GUESTS"
        )
        next(entry for entry in guest_tag["list"] if entry["descriptor"]["code"] == "GENDER")["value"] = "unknown"
        self.assertIn("error", build_hotel_on_init(HOTEL, invalid_gender))

    def test_hotel_init_rejects_expired_quote(self):
        tx = str(uuid4())
        discovery = build_hotel_on_search(HOTEL, hotel_search())
        provider = HOTEL["provider"]
        catalog_provider = discovery["message"]["catalog"]["providers"][0]
        item = catalog_provider["items"][0]
        fulfillment = catalog_provider["fulfillments"][0]
        select = select_request("hotel", provider, tx, item, fulfillment, 1, {
            "destination": "Hyderabad",
            "check_in": FUTURE_DATE.isoformat(),
            "check_out": (FUTURE_DATE + timedelta(days=2)).isoformat(),
            "rooms": 1,
            "guests": 2,
            "fulfillment_id": fulfillment["id"],
        })
        selected = build_hotel_on_select(HOTEL, select)
        expired = init_request(
            "hotel", provider, selected, tx,
            expiry=(datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat().replace("+00:00", "Z"),
        )
        callback = build_hotel_on_init(HOTEL, expired)
        self.assertIn("error", callback)
        self.assertIn("expired", callback["error"]["message"].lower())

    def test_hotel_init_returns_changed_provider_quote(self):
        tx = str(uuid4())
        discovery = build_hotel_on_search(HOTEL, hotel_search())
        provider = HOTEL["provider"]
        catalog_provider = discovery["message"]["catalog"]["providers"][0]
        item = catalog_provider["items"][0]
        fulfillment = next(
            entry for entry in catalog_provider["fulfillments"]
            if entry["id"] == item["fulfillment_ids"][0]
        )
        select = select_request("hotel", provider, tx, item, fulfillment, 1, {
            "destination": "Hyderabad",
            "check_in": FUTURE_DATE.isoformat(),
            "check_out": (FUTURE_DATE + timedelta(days=2)).isoformat(),
            "rooms": 1,
            "guests": 2,
            "fulfillment_id": fulfillment["id"],
        })
        selected = build_hotel_on_select(HOTEL, select)
        changed_inventory = deepcopy(HOTEL)
        selected_room = next(
            room for hotel in changed_inventory["hotels"] for room in hotel["rooms"]
            if room["room_id"] == item["id"].split(":")[-1]
        )
        selected_room["price"]["amount"] += 125
        callback = build_hotel_on_init(
            changed_inventory,
            init_request("hotel", provider, selected, tx),
        )
        self.assertNotIn("error", callback)
        self.assertNotEqual(
            callback["message"]["order"]["quote"]["price"]["value"],
            selected["message"]["order"]["quote"]["price"]["value"],
        )

    def test_hotel_init_rejects_guest_allocation_over_room_capacity(self):
        tx = str(uuid4())
        discovery = build_hotel_on_search(HOTEL, hotel_search(rooms=2, guests=5))
        provider = HOTEL["provider"]
        catalog_provider = discovery["message"]["catalog"]["providers"][0]
        item = next(entry for entry in catalog_provider["items"] if entry["id"].endswith("HTL-002-STE"))
        fulfillment = next(
            entry for entry in catalog_provider["fulfillments"]
            if entry["id"] == item["fulfillment_ids"][0]
        )
        select = select_request("hotel", provider, tx, item, fulfillment, 2, {
            "destination": "Hyderabad",
            "check_in": FUTURE_DATE.isoformat(),
            "check_out": (FUTURE_DATE + timedelta(days=2)).isoformat(),
            "rooms": 2,
            "guests": 5,
            "fulfillment_id": fulfillment["id"],
        })
        selected = build_hotel_on_select(HOTEL, select)
        callback = build_hotel_on_init(
            HOTEL,
            init_request("hotel", provider, selected, tx, people_count=5),
        )
        self.assertIn("error", callback)
        self.assertIn("capacity", callback["error"]["message"].lower())

    def test_experience_select_and_init_produce_valid_correlated_callbacks(self):
        tx = str(uuid4())
        discovery = build_experience_on_search(EXPERIENCE, experience_search())
        provider = EXPERIENCE["provider"]
        catalog_provider = discovery["message"]["catalog"]["providers"][0]
        item = catalog_provider["items"][0]
        fulfillment = next(
            entry for entry in catalog_provider["fulfillments"]
            if entry["id"] == item["fulfillment_ids"][0]
        )
        select = select_request("experience", provider, tx, item, fulfillment, 2, {
            "destination": "Hyderabad",
            "date": FUTURE_DATE.isoformat(),
            "participants": 2,
            "fulfillment_id": fulfillment["id"],
        })
        validate_message(select, "select")
        selected = build_experience_on_select(EXPERIENCE, select)
        validate_message(selected, "on_select")
        init = init_request("experience", provider, selected, tx)
        participant_tag = next(
            tag for tag in init["message"]["order"]["tags"]
            if tag["descriptor"]["code"] == "TDE_PARTICIPANTS"
        )
        participant_tag["list"].append({"descriptor": {"code": "AGE"}, "value": "21"})
        validate_message(init, "init")
        initialized = build_experience_on_init(EXPERIENCE, init)
        validate_message(initialized, "on_init")
        self.assertEqual(initialized["context"]["transaction_id"], tx)
        self.assertEqual(initialized["context"]["message_id"], init["context"]["message_id"])
        self.assertEqual(initialized["message"]["order"]["state"], "INITIALIZED")
        self.assertTrue(initialized["message"]["order"]["id"])
        returned_participants = next(
            tag for tag in initialized["message"]["order"]["tags"]
            if tag["descriptor"]["code"] == "TDE_PARTICIPANTS"
        )
        self.assertIn({"descriptor": {"code": "GENDER"}, "value": "female"}, returned_participants["list"])
        self.assertIn({"descriptor": {"code": "AGE"}, "value": "21"}, returned_participants["list"])

        invalid_gender = json.loads(json.dumps(init))
        participant_tag = next(
            tag for tag in invalid_gender["message"]["order"]["tags"]
            if tag["descriptor"]["code"] == "TDE_PARTICIPANTS"
        )
        next(entry for entry in participant_tag["list"] if entry["descriptor"]["code"] == "GENDER")["value"] = "unknown"
        self.assertIn("error", build_experience_on_init(EXPERIENCE, invalid_gender))

        invalid_age = json.loads(json.dumps(init))
        participant_tag = next(
            tag for tag in invalid_age["message"]["order"]["tags"]
            if tag["descriptor"]["code"] == "TDE_PARTICIPANTS"
        )
        next(entry for entry in participant_tag["list"] if entry["descriptor"]["code"] == "AGE")["value"] = "121"
        self.assertIn("error", build_experience_on_init(EXPERIENCE, invalid_age))

    def test_experience_init_returns_changed_provider_quote(self):
        tx = str(uuid4())
        discovery = build_experience_on_search(EXPERIENCE, experience_search())
        provider = EXPERIENCE["provider"]
        catalog_provider = discovery["message"]["catalog"]["providers"][0]
        item = catalog_provider["items"][0]
        fulfillment = next(
            entry for entry in catalog_provider["fulfillments"]
            if entry["id"] == item["fulfillment_ids"][0]
        )
        select = select_request("experience", provider, tx, item, fulfillment, 2, {
            "destination": "Hyderabad",
            "date": FUTURE_DATE.isoformat(),
            "participants": 2,
            "fulfillment_id": fulfillment["id"],
        })
        selected = build_experience_on_select(EXPERIENCE, select)
        changed_inventory = deepcopy(EXPERIENCE)
        changed_item = next(
            entry for entry in changed_inventory["experiences"]
            if entry["experience_id"] == item["id"]
        )
        changed_item["price"]["amount"] += 125
        callback = build_experience_on_init(
            changed_inventory,
            init_request("experience", provider, selected, tx),
        )
        self.assertNotIn("error", callback)
        self.assertNotEqual(
            callback["message"]["order"]["quote"]["price"]["value"],
            selected["message"]["order"]["quote"]["price"]["value"],
        )

    def test_experience_select_rejects_changed_time(self):
        tx = str(uuid4())
        discovery = build_experience_on_search(EXPERIENCE, experience_search())
        provider = EXPERIENCE["provider"]
        catalog_provider = discovery["message"]["catalog"]["providers"][0]
        item = catalog_provider["items"][0]
        fulfillment = catalog_provider["fulfillments"][0]
        select = select_request("experience", provider, tx, item, fulfillment, 2, {
            "destination": "Hyderabad",
            "date": FUTURE_DATE.isoformat(),
            "participants": 2,
            "fulfillment_id": fulfillment["id"],
        })
        select["message"]["order"]["fulfillments"][0]["start"]["time"]["timestamp"] = (
            datetime.combine(FUTURE_DATE, datetime.min.time(), timezone(timedelta(hours=5, minutes=30)))
            .replace(hour=10).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        )
        callback = build_experience_on_select(EXPERIENCE, select)
        self.assertIn("error", callback)

    def test_experience_provider_rejects_insufficient_capacity(self):
        tx = str(uuid4())
        discovery = build_experience_on_search(EXPERIENCE, experience_search())
        provider = EXPERIENCE["provider"]
        catalog_provider = discovery["message"]["catalog"]["providers"][0]
        item = catalog_provider["items"][0]
        fulfillment = catalog_provider["fulfillments"][0]
        select = select_request("experience", provider, tx, item, fulfillment, 99, {
            "destination": "Hyderabad",
            "date": FUTURE_DATE.isoformat(),
            "participants": 99,
            "fulfillment_id": fulfillment["id"],
        })
        callback = build_experience_on_select(EXPERIENCE, select)
        self.assertIn("error", callback)

    def test_provider_order_store_is_idempotent_per_init_message(self):
        with tempfile.TemporaryDirectory() as state_dir, patch.dict(
            "os.environ", {"MOCK_PROVIDER_STATE_DIR": state_dir}
        ):
            order = {"id": "order-test", "state": "INITIALIZED"}
            tx, message_id = str(uuid4()), str(uuid4())
            save_initialized_order("provider-one", tx, message_id, order)
            save_initialized_order("provider-one", tx, message_id, order)
            self.assertEqual(get_initialized_order("provider-one", order["id"]), order)
