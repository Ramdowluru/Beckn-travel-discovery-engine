import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from common.beckn_converter import build_on_init, build_on_select
from common.beckn_converter import build_on_search as build_transport_on_search
from common.cancellation import build_on_cancel
from common.confirmation import build_on_confirm
from common.status import build_on_status
from common.inventory import inventory_key, with_current_inventory
from common.order_store import (
    _connect,
    cancel_provider_order,
    confirm_provider_order,
    get_inventory_available,
    get_order,
    get_order_owner,
    save_initialized_order,
)
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
BAP_ID = "bap.example.in"
BAP_URI = "http://localhost:8000"
FUTURE = date.today() + timedelta(days=30)


def _context(action, provider, transaction_id, message_id):
    return {
        "domain": "TRV",
        "version": "1.1.0",
        "ttl": "PT30S",
        "action": action,
        "bap_id": BAP_ID,
        "bap_uri": BAP_URI,
        "bpp_id": provider["bpp_id"],
        "bpp_uri": provider["bpp_uri"],
        "transaction_id": transaction_id,
        "message_id": message_id,
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
    }


def _price_acceptance(order):
    confirmed = json.loads(json.dumps(order))
    confirmed["tags"].append({
        "descriptor": {"code": "TDE_PRICE_ACCEPTANCE"},
        "list": [
            {"descriptor": {"code": "ACCEPTED"}, "value": "true"},
            {"descriptor": {"code": "CURRENCY"}, "value": confirmed["quote"]["price"]["currency"]},
            {"descriptor": {"code": "AMOUNT"}, "value": confirmed["quote"]["price"]["value"]},
        ],
    })
    return confirmed


def _transport_orders(data, transaction_id):
    provider = data["provider"]
    service = next(item for item in data["services"] if item["seats_available"] > 0)
    travel_date = FUTURE.isoformat()
    selection = {
        "context": _context("select", provider, transaction_id, str(uuid4())),
        "message": {"order": {
            "provider": {"id": provider["id"]},
            "items": [{"id": service["service_id"], "quantity": {"selected": {"count": 1}}}],
            "fulfillment_date": travel_date,
        }},
    }
    selected = build_on_select(data, selection)["message"]["order"]
    init_message_id = str(uuid4())
    init = {
        "context": _context("init", provider, transaction_id, init_message_id),
        "message": {"order": {
            "provider": selected["provider"],
            "items": selected["items"],
            "fulfillments": [selected["items"][0]["fulfillment"]],
            "quote": selected["quote"],
            "billing": {"name": "Test Traveller", "email": "test@example.test", "phone": "+12345678901"},
            "tags": [
                {"descriptor": {"code": "TRAVELLERS"}, "list": [
                    {"descriptor": {"code": "NAME"}, "value": "Test Traveller"},
                ]},
                {"descriptor": {"code": "TDE_QUOTE"}, "list": [
                    {"descriptor": {"code": "EXPIRES_AT"}, "value": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat().replace("+00:00", "Z")},
                ]},
            ],
        }},
    }
    return selection, init, service, travel_date


def _hotel_orders(data, transaction_id):
    provider = data["provider"]
    search = {
        "context": {"transaction_id": transaction_id, "bap_uri": BAP_URI},
        "message": {"intent": {
            "fulfillment": {
                "location": {"descriptor": {"name": "Hyderabad"}},
                "start": {"time": {"range": {"start": f"{FUTURE.isoformat()}T00:00:00Z"}}},
                "end": {"time": {"range": {"end": f"{(FUTURE + timedelta(days=2)).isoformat()}T00:00:00Z"}}},
            },
            "tags": [
                {"descriptor": {"code": "ROOMS"}, "list": [{"descriptor": {"code": "COUNT"}, "value": "1"}]},
                {"descriptor": {"code": "GUESTS"}, "list": [{"descriptor": {"code": "COUNT"}, "value": "2"}]},
            ],
        }},
    }
    catalog = build_hotel_on_search(data, search)["message"]["catalog"]["providers"][0]
    item = catalog["items"][0]
    fulfillment = next(entry for entry in catalog["fulfillments"] if entry["id"] == item["fulfillment_ids"][0])
    criteria = {
        "destination": "Hyderabad",
        "check_in": FUTURE.isoformat(),
        "check_out": (FUTURE + timedelta(days=2)).isoformat(),
        "rooms": 1,
        "guests": 2,
        "room_capacity": int(next(
            tag["value"] for group in item["tags"] for tag in group.get("list", [])
            if tag.get("descriptor", {}).get("code") == "ROOM_CAPACITY"
        )),
        "fulfillment_id": fulfillment["id"],
    }
    tags = [{
        "descriptor": {"code": "TDE_HOTEL_BOOKING"},
        "list": [{"descriptor": {"code": key.upper()}, "value": str(value)} for key, value in criteria.items()],
    }]
    select = {
        "context": _context("select", provider, transaction_id, str(uuid4())),
        "message": {"order": {
            "provider": {"id": provider["id"]},
            "items": [{"id": item["id"], "quantity": {"selected": {"count": 1}}}],
            "fulfillments": [fulfillment],
            "tags": tags,
        }},
    }
    selected = build_hotel_on_select(data, select)["message"]["order"]
    init = {
        "context": _context("init", provider, transaction_id, str(uuid4())),
        "message": {"order": {
            "provider": selected["provider"],
            "items": selected["items"],
            "fulfillments": selected["fulfillments"],
            "quote": selected["quote"],
            "billing": {"name": "Test Guest", "email": "test@example.test", "phone": "+12345678901"},
            "tags": [
                *selected["tags"],
                {"descriptor": {"code": "TDE_GUESTS"}, "list": [
                    {"descriptor": {"code": "NAME"}, "value": "Test Guest"},
                    {"descriptor": {"code": "ROOM"}, "value": "1"},
                    {"descriptor": {"code": "NAME"}, "value": "Test Guest Two"},
                    {"descriptor": {"code": "ROOM"}, "value": "1"},
                ]},
                {"descriptor": {"code": "TDE_QUOTE"}, "list": [
                    {"descriptor": {"code": "EXPIRES_AT"}, "value": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat().replace("+00:00", "Z")},
                ]},
            ],
        }},
    }
    return select, init, item, criteria


def _experience_orders(data, transaction_id):
    provider = data["provider"]
    search = {
        "context": {"transaction_id": transaction_id, "bap_uri": BAP_URI},
        "message": {"intent": {
            "fulfillment": {
                "type": "EXPERIENCE",
                "location": {"descriptor": {"name": "Hyderabad"}},
                "start": {"time": {"range": {"start": f"{FUTURE.isoformat()}T00:00:00Z", "end": f"{FUTURE.isoformat()}T23:59:59Z"}}},
            },
            "tags": [{"descriptor": {"code": "NUM_PARTICIPANTS"}, "list": [{"descriptor": {"code": "COUNT"}, "value": "2"}]}],
        }},
    }
    catalog = build_experience_on_search(data, search)["message"]["catalog"]["providers"][0]
    item = catalog["items"][0]
    fulfillment = next(entry for entry in catalog["fulfillments"] if entry["id"] == item["fulfillment_ids"][0])
    criteria = {
        "destination": "Hyderabad",
        "date": FUTURE.isoformat(),
        "participants": 2,
        "fulfillment_id": fulfillment["id"],
    }
    select = {
        "context": _context("select", provider, transaction_id, str(uuid4())),
        "message": {"order": {
            "provider": {"id": provider["id"]},
            "items": [{"id": item["id"], "quantity": {"selected": {"count": 2}}}],
            "fulfillments": [fulfillment],
            "tags": [{
                "descriptor": {"code": "TDE_EXPERIENCE_BOOKING"},
                "list": [{"descriptor": {"code": key.upper()}, "value": str(value)} for key, value in criteria.items()],
            }],
        }},
    }
    selected = build_experience_on_select(data, select)["message"]["order"]
    init = {
        "context": _context("init", provider, transaction_id, str(uuid4())),
        "message": {"order": {
            "provider": selected["provider"],
            "items": selected["items"],
            "fulfillments": selected["fulfillments"],
            "quote": selected["quote"],
            "billing": {"name": "Test Participant", "email": "test@example.test", "phone": "+12345678901"},
            "tags": [
                *selected["tags"],
                {"descriptor": {"code": "TDE_PARTICIPANTS"}, "list": [
                    {"descriptor": {"code": "NAME"}, "value": "Test Participant"},
                    {"descriptor": {"code": "NAME"}, "value": "Test Participant Two"},
                ]},
                {"descriptor": {"code": "TDE_QUOTE"}, "list": [
                    {"descriptor": {"code": "EXPIRES_AT"}, "value": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat().replace("+00:00", "Z")},
                ]},
            ],
        }},
    }
    return select, init, item, criteria


class ProviderConfirmationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        prepare_order_validation()

    def _assert_confirmation(self, data, kind, select, init):
        provider_id = data["provider"]["bpp_id"]
        transaction_id = select["context"]["transaction_id"]
        if kind == "transport":
            selected = build_on_select(data, select)
            initialized = build_on_init(data, init)
        elif kind == "hotel":
            selected = build_hotel_on_select(data, select)
            initialized = build_hotel_on_init(data, init)
        else:
            selected = build_experience_on_select(data, select)
            initialized = build_experience_on_init(data, init)
        self.assertNotIn("error", selected)
        self.assertNotIn("error", initialized)
        validate_message(initialized, "on_init")
        order = initialized["message"]["order"]
        save_initialized_order(
            provider_id,
            transaction_id,
            init["context"]["message_id"],
            order,
            BAP_ID,
        )
        confirm_message_id = str(uuid4())
        confirm = {
            "context": _context("confirm", data["provider"], transaction_id, confirm_message_id),
            "message": {"order": _price_acceptance(order)},
        }
        validate_message(confirm, "confirm")
        first = build_on_confirm(
            with_current_inventory(data, provider_id, kind, confirm),
            confirm,
            kind,
        )
        self.assertNotIn("error", first)
        validate_message(first, "on_confirm")
        self.assertEqual(first["message"]["order"]["state"], "CONFIRMED")
        self.assertEqual(first["context"]["message_id"], confirm_message_id)
        return order, first

    def test_bus_train_and_flight_confirm_and_deduct_date_scoped_seats(self):
        for mode, directory in (("bus", "mock_bus"), ("train", "mock_train"), ("flight", "mock_flight")):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as state_dir, patch.dict(
                "os.environ", {"MOCK_PROVIDER_STATE_DIR": state_dir}
            ):
                data = json.loads((ROOT / directory / "data.json").read_text(encoding="utf-8"))
                tx = str(uuid4())
                select, init, service, travel_date = _transport_orders(data, tx)
                initial = int(service["seats_available"])
                order, callback = self._assert_confirmation(data, "transport", select, init)
                key = inventory_key("transport", service["service_id"], FUTURE)
                self.assertEqual(get_inventory_available(data["provider"]["bpp_id"], key, initial), initial - 1)
                duplicate = {
                    **select,
                    "context": _context("confirm", data["provider"], tx, str(uuid4())),
                    "message": {"order": _price_acceptance(order)},
                }
                repeated = build_on_confirm(data, duplicate, "transport")
                self.assertNotIn("error", repeated)
                self.assertEqual(get_inventory_available(data["provider"]["bpp_id"], key, initial), initial - 1)
                self.assertEqual(callback["message"]["order"]["id"], order["id"])
                self.assertEqual(travel_date, FUTURE.isoformat())
                self.assertEqual(repeated["message"]["order"]["payments"][0]["status"], "NOT-PAID")
                search = {
                    "context": _context("search", data["provider"], str(uuid4()), str(uuid4())),
                    "message": {"intent": {
                        "fulfillment": {"stops": [
                            {"type": "START", "location": {"descriptor": {"name": service["from"]["city"]}},
                             "time": {"range": {"start": f"{travel_date}T00:00:00Z"}}},
                            {"type": "END", "location": {"descriptor": {"name": service["to"]["city"]}}},
                        ]},
                        "tags": [{"descriptor": {"code": "NUM_TRAVELERS"},
                                  "list": [{"descriptor": {"code": "COUNT"}, "value": "1"}]}],
                    }},
                }
                refreshed = build_transport_on_search(
                    with_current_inventory(data, data["provider"]["bpp_id"], "transport", search),
                    search,
                )
                found = next(
                    item for provider_result in refreshed["message"]["catalog"]["providers"]
                    for item in provider_result["items"] if item["id"] == service["service_id"]
                )
                self.assertEqual(found["quantity"]["available"]["count"], initial - 1)

    def test_hotel_and_experience_confirmation_decrement_provider_inventory(self):
        for kind, directory, builder in (
            ("hotel", "mock_hotel", _hotel_orders),
            ("experience", "mock_experience", _experience_orders),
        ):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as state_dir, patch.dict(
                "os.environ", {"MOCK_PROVIDER_STATE_DIR": state_dir}
            ):
                data = json.loads((ROOT / directory / "data.json").read_text(encoding="utf-8"))
                tx = str(uuid4())
                select, init, item, criteria = builder(data, tx)
                selected_item_id = item["id"]
                order, _ = self._assert_confirmation(data, kind, select, init)
                if kind == "hotel":
                    hotel_id, room_id = item["id"].split(":")[1:]
                    inventory_id = f"{hotel_id}:{room_id}"
                    hotel = next(entry for entry in data["hotels"] if entry["hotel_id"] == hotel_id)
                    initial = int(next(room["availability"] for room in hotel["rooms"] if room["room_id"] == room_id))
                    for night in range(2):
                        key = inventory_key("hotel", inventory_id, FUTURE + timedelta(days=night))
                        self.assertEqual(get_inventory_available(data["provider"]["bpp_id"], key, initial), initial - 1)
                    search = {
                        "context": {"action": "search", "transaction_id": str(uuid4()), "bap_uri": BAP_URI},
                        "message": {"intent": {
                            "fulfillment": {
                                "location": {"descriptor": {"name": criteria["destination"]}},
                                "start": {"time": {"range": {"start": f"{criteria['check_in']}T00:00:00Z"}}},
                                "end": {"time": {"range": {"end": f"{criteria['check_out']}T00:00:00Z"}}},
                            },
                            "tags": [
                                {"descriptor": {"code": "ROOMS"}, "list": [{"descriptor": {"code": "COUNT"}, "value": "1"}]},
                                {"descriptor": {"code": "GUESTS"}, "list": [{"descriptor": {"code": "COUNT"}, "value": "2"}]},
                            ],
                        }},
                    }
                    refreshed = build_hotel_on_search(
                        with_current_inventory(data, data["provider"]["bpp_id"], kind, search),
                        search,
                    )
                    found = next(
                        item for provider_result in refreshed["message"]["catalog"]["providers"]
                        for item in provider_result["items"] if item["id"] == selected_item_id
                    )
                    self.assertEqual(found["quantity"]["available"]["count"], initial - 1)
                else:
                    key = inventory_key("experience", item["id"], FUTURE, "09:00")
                    initial = int(next(entry["slots_remaining"] for entry in data["experiences"] if entry["experience_id"] == item["id"]))
                    self.assertEqual(get_inventory_available(data["provider"]["bpp_id"], key, initial), initial - 2)
                    self.assertEqual(order["payments"][0]["status"], "NOT-PAID")
                    search = {
                        "context": {"action": "search", "transaction_id": str(uuid4()), "bap_uri": BAP_URI},
                        "message": {"intent": {
                            "fulfillment": {
                                "type": "EXPERIENCE",
                                "location": {"descriptor": {"name": criteria["destination"]}},
                                "start": {"time": {"range": {"start": f"{criteria['date']}T00:00:00Z", "end": f"{criteria['date']}T23:59:59Z"}}},
                            },
                            "tags": [{"descriptor": {"code": "NUM_PARTICIPANTS"},
                                      "list": [{"descriptor": {"code": "COUNT"}, "value": "2"}]}],
                        }},
                    }
                    refreshed = build_experience_on_search(
                        with_current_inventory(data, data["provider"]["bpp_id"], kind, search),
                        search,
                    )
                    found = next(
                        item for provider_result in refreshed["message"]["catalog"]["providers"]
                        for item in provider_result["items"] if item["id"] == selected_item_id
                    )
                    self.assertEqual(found["quantity"]["available"]["count"], initial - 2)

    def test_insufficient_one_of_multiple_nights_does_not_partially_deduct(self):
        with tempfile.TemporaryDirectory() as state_dir, patch.dict(
            "os.environ", {"MOCK_PROVIDER_STATE_DIR": state_dir}
        ):
            provider = "provider.test"
            order = {"id": "order-hotel", "state": "INITIALIZED", "items": []}
            save_initialized_order(provider, "tx", "init-msg", order, BAP_ID)
            key_one, key_two = "night-one", "night-two"
            self.assertEqual(get_inventory_available(provider, key_one, 3), 3)
            self.assertEqual(get_inventory_available(provider, key_two, 0), 0)
            state, confirmed = confirm_provider_order(
                provider_id=provider,
                order_id=order["id"],
                transaction_id="tx",
                bap_id=BAP_ID,
                message_id="confirm-msg",
                order={**order, "state": "CONFIRMED"},
                requirements=[(key_one, 1, 3), (key_two, 1, 0)],
            )
            self.assertEqual(state, "UNAVAILABLE")
            self.assertIsNone(confirmed)
            self.assertEqual(get_inventory_available(provider, key_one, 3), 3)
            self.assertEqual(get_order(provider, order["id"]), order)

    def test_confirm_rejects_another_bap_changed_price_and_expired_quote(self):
        data = json.loads((ROOT / "mock_bus" / "data.json").read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as state_dir, patch.dict(
            "os.environ", {"MOCK_PROVIDER_STATE_DIR": state_dir}
        ):
            tx = str(uuid4())
            select, init, service, _ = _transport_orders(data, tx)
            initialized = build_on_init(data, init)["message"]["order"]
            save_initialized_order(
                data["provider"]["bpp_id"],
                tx,
                init["context"]["message_id"],
                initialized,
                BAP_ID,
            )
            accepted = _price_acceptance(initialized)
            other_bap = {
                "context": {
                    **_context("confirm", data["provider"], tx, str(uuid4())),
                    "bap_id": "other-bap.example.in",
                },
                "message": {"order": accepted},
            }
            self.assertIn("error", build_on_confirm(data, other_bap, "transport"))

            service["price"]["amount"] += 1
            changed_price = {
                "context": _context("confirm", data["provider"], tx, str(uuid4())),
                "message": {"order": accepted},
            }
            self.assertIn("error", build_on_confirm(data, changed_price, "transport"))

            expired_tx = str(uuid4())
            _, expired_init, _, _ = _transport_orders(data, expired_tx)
            expired_order = build_on_init(data, expired_init)["message"]["order"]
            for tag in expired_order["tags"]:
                if tag.get("descriptor", {}).get("code") == "TDE_QUOTE":
                    tag["list"][0]["value"] = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
            save_initialized_order(
                data["provider"]["bpp_id"],
                expired_tx,
                expired_init["context"]["message_id"],
                expired_order,
                BAP_ID,
            )
            expired_request = {
                "context": _context("confirm", data["provider"], expired_tx, str(uuid4())),
                "message": {"order": _price_acceptance(expired_order)},
            }
            callback = build_on_confirm(data, expired_request, "transport")
            self.assertIn("error", callback)
            self.assertIn("expired", callback["error"]["message"].lower())

    def test_duplicate_concurrent_confirm_callbacks_deduct_only_once(self):
        with tempfile.TemporaryDirectory() as state_dir, patch.dict(
            "os.environ", {"MOCK_PROVIDER_STATE_DIR": state_dir}
        ):
            provider = "provider.concurrent"
            order = {"id": "order-concurrent", "state": "INITIALIZED"}
            save_initialized_order(provider, "tx", "init-msg", order, BAP_ID)
            key = "seat:service:date"

            def confirm(message_id):
                return confirm_provider_order(
                    provider_id=provider,
                    order_id=order["id"],
                    transaction_id="tx",
                    bap_id=BAP_ID,
                    message_id=message_id,
                    order={**order, "state": "CONFIRMED"},
                    requirements=[(key, 1, 2)],
                )

            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(confirm, ("confirm-one", "confirm-two")))
            self.assertEqual([result[0] for result in results], ["CONFIRMED", "CONFIRMED"])
            self.assertEqual(get_inventory_available(provider, key, 2), 1)
            self.assertEqual(get_order(provider, order["id"])["state"], "CONFIRMED")

    def test_concurrent_distinct_orders_cannot_oversell_inventory(self):
        with tempfile.TemporaryDirectory() as state_dir, patch.dict(
            "os.environ", {"MOCK_PROVIDER_STATE_DIR": state_dir}
        ):
            provider = "provider.oversell"
            orders = [
                {"id": "order-one", "state": "INITIALIZED"},
                {"id": "order-two", "state": "INITIALIZED"},
            ]
            for index, order in enumerate(orders):
                save_initialized_order(provider, f"tx-{index}", f"init-{index}", order, BAP_ID)
            key = "seat:service:future-date"

            def confirm(index):
                order = orders[index]
                return confirm_provider_order(
                    provider_id=provider,
                    order_id=order["id"],
                    transaction_id=f"tx-{index}",
                    bap_id=BAP_ID,
                    message_id=f"confirm-{index}",
                    order={**order, "state": "CONFIRMED"},
                    requirements=[(key, 1, 1)],
                )

            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(confirm, (0, 1)))

            self.assertEqual(
                sorted(result[0] for result in results),
                ["CONFIRMED", "UNAVAILABLE"],
            )
            self.assertEqual(get_inventory_available(provider, key, 1), 0)
            self.assertEqual(
                sum(get_order(provider, order["id"])["state"] == "CONFIRMED" for order in orders),
                1,
            )

    def test_confirmed_order_and_inventory_survive_store_reopen(self):
        with tempfile.TemporaryDirectory() as state_dir, patch.dict(
            "os.environ", {"MOCK_PROVIDER_STATE_DIR": state_dir}
        ):
            provider = "provider.restart"
            order = {"id": "order-persistent", "state": "INITIALIZED"}
            key = "activity:date:09:00"
            save_initialized_order(provider, "tx-persistent", "init-persistent", order, BAP_ID)

            state, confirmed = confirm_provider_order(
                provider_id=provider,
                order_id=order["id"],
                transaction_id="tx-persistent",
                bap_id=BAP_ID,
                message_id="confirm-persistent",
                order={**order, "state": "CONFIRMED"},
                requirements=[(key, 2, 4)],
            )

            self.assertEqual(state, "CONFIRMED")
            self.assertEqual(confirmed["state"], "CONFIRMED")
            self.assertEqual(get_order(provider, order["id"])["state"], "CONFIRMED")
            self.assertEqual(get_order_owner(provider, order["id"]), ("tx-persistent", BAP_ID, "CONFIRMED"))
            self.assertEqual(get_inventory_available(provider, key, 4), 2)

            probe = (
                "import json; "
                "from common.order_store import get_inventory_available, get_order, get_order_owner; "
                f"print(json.dumps([get_order({provider!r}, {order['id']!r}), "
                f"get_order_owner({provider!r}, {order['id']!r}), "
                f"get_inventory_available({provider!r}, {key!r}, 4)]))"
            )
            environment = {
                **os.environ,
                "MOCK_PROVIDER_STATE_DIR": state_dir,
                "PYTHONPATH": str(ROOT / "mock_providers"),
            }
            restarted = subprocess.run(
                [sys.executable, "-c", probe],
                cwd=ROOT,
                env=environment,
                check=True,
                capture_output=True,
                text=True,
            )
            persisted_order, persisted_owner, persisted_inventory = json.loads(restarted.stdout)
            self.assertEqual(persisted_order["state"], "CONFIRMED")
            self.assertEqual(persisted_owner, ["tx-persistent", BAP_ID, "CONFIRMED"])
            self.assertEqual(persisted_inventory, 2)

            cancelled_order = {
                **confirmed,
                "state": "CANCELLED",
                "status": "CANCELLED",
                "cancellation": {"cancelled_by": "CONSUMER"},
            }
            cancel_state, saved_cancelled = cancel_provider_order(
                provider_id=provider,
                order_id=order["id"],
                transaction_id="tx-persistent",
                bap_id=BAP_ID,
                message_id="cancel-persistent",
                cancelled_order=cancelled_order,
            )
            self.assertEqual(cancel_state, "CANCELLED")
            self.assertEqual(saved_cancelled["status"], "CANCELLED")
            self.assertEqual(get_inventory_available(provider, key, 4), 4)
            cancelled_probe = (
                "import json; "
                "from common.order_store import get_inventory_available, get_order, get_order_owner; "
                f"print(json.dumps([get_order({provider!r}, {order['id']!r}), "
                f"get_order_owner({provider!r}, {order['id']!r}), "
                f"get_inventory_available({provider!r}, {key!r}, 4)]))"
            )
            restarted_cancelled = subprocess.run(
                [sys.executable, "-c", cancelled_probe],
                cwd=ROOT,
                env=environment,
                check=True,
                capture_output=True,
                text=True,
            )
            saved_order, saved_owner, saved_inventory = json.loads(restarted_cancelled.stdout)
            self.assertEqual(saved_order["state"], "CANCELLED")
            self.assertEqual(saved_owner, ["tx-persistent", BAP_ID, "CANCELLED"])
            self.assertEqual(saved_inventory, 4)

    def test_status_reads_provider_order_without_changing_inventory(self):
        for kind, directory, builder in (
            ("transport", "mock_bus", _transport_orders),
            ("transport", "mock_train", _transport_orders),
            ("transport", "mock_flight", _transport_orders),
            ("hotel", "mock_hotel", _hotel_orders),
            ("experience", "mock_experience", _experience_orders),
        ):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as state_dir, patch.dict(
                "os.environ", {"MOCK_PROVIDER_STATE_DIR": state_dir}
            ):
                data = json.loads((ROOT / directory / "data.json").read_text(encoding="utf-8"))
                transaction_id = str(uuid4())
                select, init, item, criteria = builder(data, transaction_id)
                order, _ = self._assert_confirmation(data, kind, select, init)
                if kind == "transport":
                    key = inventory_key("transport", item["service_id"], FUTURE)
                    initial = int(item["seats_available"])
                    expected = initial - 1
                elif kind == "hotel":
                    hotel_id, room_id = item["id"].split(":")[1:3]
                    inventory_id = f"{hotel_id}:{room_id}"
                    hotel = next(entry for entry in data["hotels"] if entry["hotel_id"] == hotel_id)
                    initial = int(next(room["availability"] for room in hotel["rooms"] if room["room_id"] == room_id))
                    key = inventory_key("hotel", inventory_id, FUTURE)
                    expected = initial - 1
                else:
                    initial = int(next(entry["slots_remaining"] for entry in data["experiences"] if entry["experience_id"] == item["id"]))
                    key = inventory_key("experience", item["id"], FUTURE, "09:00")
                    expected = initial - 2
                self.assertEqual(get_inventory_available(data["provider"]["bpp_id"], key, initial), expected)

                status_request = {
                    "context": _context(
                        "status",
                        data["provider"],
                        transaction_id,
                        str(uuid4()),
                    ),
                    "message": {"order_id": order["id"]},
                }
                validate_message(status_request, "status")
                callback = build_on_status(data, status_request)
                validate_message(callback, "on_status")
                self.assertEqual(callback["message"]["order"], get_order(data["provider"]["bpp_id"], order["id"]))
                self.assertEqual(get_inventory_available(data["provider"]["bpp_id"], key, initial), expected)

                wrong_owner = {
                    **status_request,
                    "context": {
                        **status_request["context"],
                        "bap_id": "another-bap.example.in",
                    },
                }
                error = build_on_status(data, wrong_owner)
                self.assertIn("error", error)
                validate_message(error, "on_status")
                self.assertEqual(get_inventory_available(data["provider"]["bpp_id"], key, initial), expected)

    def test_cancel_restores_inventory_once_for_every_provider_category(self):
                providers = (
                    ("transport", "mock_bus", _transport_orders),
                    ("transport", "mock_train", _transport_orders),
                    ("transport", "mock_flight", _transport_orders),
                    ("hotel", "mock_hotel", _hotel_orders),
                    ("experience", "mock_experience", _experience_orders),
                )
                for kind, directory, builder in providers:
                    with self.subTest(provider=directory), tempfile.TemporaryDirectory() as state_dir, patch.dict(
                        "os.environ", {"MOCK_PROVIDER_STATE_DIR": state_dir}
                    ):
                        data = json.loads((ROOT / directory / "data.json").read_text(encoding="utf-8"))
                        transaction_id = str(uuid4())
                        select, init, item, _ = builder(data, transaction_id)
                        order, _ = self._assert_confirmation(data, kind, select, init)
                        provider_id = data["provider"]["bpp_id"]
                        if kind == "transport":
                            allocation = [(inventory_key(kind, item["service_id"], FUTURE), int(item["seats_available"]))]
                        elif kind == "hotel":
                            hotel_id, room_id = item["id"].split(":")[1:3]
                            hotel = next(entry for entry in data["hotels"] if entry["hotel_id"] == hotel_id)
                            capacity = int(next(room["availability"] for room in hotel["rooms"] if room["room_id"] == room_id))
                            allocation = [
                                (inventory_key(kind, f"{hotel_id}:{room_id}", FUTURE + timedelta(days=offset)), capacity)
                                for offset in range(2)
                            ]
                        else:
                            allocation = [(
                                inventory_key(kind, item["id"], FUTURE, "09:00"),
                                int(next(entry["slots_remaining"] for entry in data["experiences"] if entry["experience_id"] == item["id"])),
                            )]

                        wrong_owner = {
                            "context": _context("cancel", data["provider"], transaction_id, str(uuid4())),
                            "message": {
                                "order_id": order["id"],
                                "cancellation_reason_id": "TDE_USER_REQUEST",
                                "descriptor": {"short_desc": "Plans changed"},
                            },
                        }
                        wrong_owner["context"]["bap_id"] = "another-bap.example.in"
                        rejected = build_on_cancel(data, wrong_owner, kind)
                        self.assertIn("error", rejected)
                        self.assertEqual(get_order_owner(provider_id, order["id"])[2], "CONFIRMED")

                        persisted = get_order(provider_id, order["id"])
                        original_order_json = json.dumps(persisted, separators=(",", ":"))
                        if kind == "hotel":
                            for group in persisted["tags"]:
                                if group.get("descriptor", {}).get("code") == "TDE_HOTEL_BOOKING":
                                    for entry in group.get("list", []):
                                        if entry.get("descriptor", {}).get("code") == "CHECK_IN":
                                            entry["value"] = (date.today() - timedelta(days=1)).isoformat()
                        else:
                            fulfillment = persisted["fulfillments"][0]
                            timestamp = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat().replace("+00:00", "Z")
                            start = fulfillment.get("start", {}).get("time")
                            if start is not None:
                                start["timestamp"] = timestamp
                            else:
                                start_stop = next(stop for stop in fulfillment["stops"] if stop.get("type") == "START")
                                start_stop["time"]["timestamp"] = timestamp
                        with closing(_connect(provider_id)) as database:
                            database.execute(
                                "UPDATE provider_orders SET order_json = ? WHERE order_id = ?",
                                (json.dumps(persisted, separators=(",", ":")), order["id"]),
                            )
                            database.commit()
                        too_late = {
                            "context": _context("cancel", data["provider"], transaction_id, str(uuid4())),
                            "message": {
                                "order_id": order["id"],
                                "cancellation_reason_id": "TDE_USER_REQUEST",
                                "descriptor": {"short_desc": "Plans changed"},
                            },
                        }
                        ineligible = build_on_cancel(data, too_late, kind)
                        self.assertIn("error", ineligible)
                        self.assertIn("not eligible", ineligible["error"]["message"].lower())
                        for resource_key, capacity in allocation:
                            quantity = order["items"][0]["quantity"]["selected"]["count"]
                            self.assertEqual(
                                get_inventory_available(provider_id, resource_key, capacity),
                                capacity - quantity,
                            )
                        with closing(_connect(provider_id)) as database:
                            database.execute(
                                "UPDATE provider_orders SET order_json = ? WHERE order_id = ?",
                                (original_order_json, order["id"]),
                            )
                            database.commit()

                        def cancel(message_id):
                            request = {
                                "context": _context("cancel", data["provider"], transaction_id, message_id),
                                "message": {
                                    "order_id": order["id"],
                                    "cancellation_reason_id": "TDE_USER_REQUEST",
                                    "descriptor": {"short_desc": "Plans changed"},
                                },
                            }
                            validate_message(request, "cancel")
                            callback = build_on_cancel(data, request, kind)
                            validate_message(callback, "on_cancel")
                            return callback

                        with ThreadPoolExecutor(max_workers=2) as pool:
                            callbacks = list(pool.map(cancel, (str(uuid4()), str(uuid4()))))
                        self.assertTrue(all("error" not in callback for callback in callbacks))
                        self.assertEqual(callbacks[0]["message"]["order"]["state"], "CANCELLED")
                        self.assertEqual(callbacks[0]["message"]["order"]["status"], "CANCELLED")
                        self.assertEqual(get_order_owner(provider_id, order["id"])[2], "CANCELLED")
                        for resource_key, capacity in allocation:
                            self.assertEqual(get_inventory_available(provider_id, resource_key, capacity), capacity)
                        status_request = {
                            "context": _context("status", data["provider"], transaction_id, str(uuid4())),
                            "message": {"order_id": order["id"]},
                        }
                        status_callback = build_on_status(data, status_request)
                        validate_message(status_callback, "on_status")
                        self.assertEqual(status_callback["message"]["order"]["state"], "CANCELLED")
                        self.assertEqual(status_callback["message"]["order"]["cancellation"]["cancelled_by"], "CONSUMER")

    def test_status_unknown_order_is_a_schema_valid_error(self):
        data = json.loads((ROOT / "mock_bus" / "data.json").read_text(encoding="utf-8"))
        request = {
            "context": _context("status", data["provider"], str(uuid4()), str(uuid4())),
            "message": {"order_id": "not-a-provider-order"},
        }
        response = build_on_status(data, request)
        self.assertIn("error", response)
        validate_message(response, "on_status")

    def test_duplicate_provider_order_cannot_replace_saved_order(self):
        with tempfile.TemporaryDirectory() as state_dir, patch.dict(
            "os.environ", {"MOCK_PROVIDER_STATE_DIR": state_dir}
        ):
            provider = "provider.identity"
            saved = {"id": "provider-order-1", "state": "INITIALIZED", "marker": "original"}
            save_initialized_order(provider, "tx-one", "init-one", saved, BAP_ID)

            with self.assertRaises(sqlite3.IntegrityError):
                save_initialized_order(
                    provider,
                    "tx-two",
                    "init-two",
                    {"id": saved["id"], "state": "INITIALIZED", "marker": "replacement"},
                    BAP_ID,
                )

            self.assertEqual(get_order(provider, saved["id"]), saved)
            other_provider_order = {**saved, "marker": "independent"}
            save_initialized_order("another.provider", "tx-two", "init-two", other_provider_order, BAP_ID)
            self.assertEqual(get_order("another.provider", saved["id"]), other_provider_order)
