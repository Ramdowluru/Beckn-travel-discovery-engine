import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.services.beckn_order_builder import build_transport_init, build_transport_select
from common.beckn_converter import build_on_init, build_on_select
from protocol.contracts import ProtocolError, validate_message


def _request(service_id="BUS-001", quantity=1):
    data = json.loads(Path("mock_providers/mock_bus/data.json").read_text(encoding="utf-8"))
    return data, build_transport_select(
        transaction_id="11111111-1111-4111-8111-111111111111",
        message_id="22222222-2222-4222-8222-222222222222",
        provider={"id": data["provider"]["bpp_id"], "uri": data["provider"]["bpp_uri"]},
        item={"id": service_id, "provider_id": data["provider"]["id"]},
        fulfillment={},
        quantity=quantity,
        travel_date=(datetime.now(timezone.utc).date() + timedelta(days=1)).isoformat(),
    )


def test_select_and_on_select_use_core_v11_envelopes():
    data, request = _request()
    validate_message(request, "select", fresh=False)
    callback = build_on_select(data, request)
    validate_message(callback, "on_select", fresh=False)
    assert callback["context"]["transaction_id"] == request["context"]["transaction_id"]
    assert callback["context"]["message_id"] == request["context"]["message_id"]


def test_provider_revalidates_unknown_item_and_quantity():
    data, request = _request(service_id="NOT-IN-INVENTORY")
    callback = build_on_select(data, request)
    validate_message(callback, "on_select", fresh=False)
    assert callback["error"]["code"] == "30004"

    _, unavailable = _request(quantity=999)
    callback = build_on_select(data, unavailable)
    validate_message(callback, "on_select", fresh=False)
    assert callback["error"]["code"] == "30005"


def test_provider_init_revalidates_expiry_and_returns_changed_quote():
    data, request = _request()
    selection = build_on_select(data, request)
    order = selection["message"]["order"]
    init_request = build_transport_init(
        transaction_id=request["context"]["transaction_id"],
        message_id="33333333-3333-4333-8333-333333333333",
        provider={"id": data["provider"]["bpp_id"], "uri": data["provider"]["bpp_uri"]},
        item={"id": order["items"][0]["id"], "provider_id": order["provider"]["id"]},
        quantity=1,
        quote=order["quote"],
        fulfillment=order["items"][0]["fulfillment"],
        details={
            "travellers": [{"name": "A Traveller"}],
            "contact_email": "traveller@example.com",
            "contact_phone": "1234567890",
        },
        quote_expires_at=(datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
    )
    service = next(item for item in data["services"] if item["service_id"] == "BUS-001")
    service["price"]["amount"] += 50
    callback = build_on_init(data, init_request)
    validate_message(callback, "on_init", fresh=False)
    initialized = callback["message"]["order"]
    assert initialized["state"] == "INITIALIZED"
    assert initialized["quote"]["price"]["value"] != order["quote"]["price"]["value"]
    assert initialized["payments"][0]["status"] == "NOT-PAID"

    expired = json.loads(json.dumps(init_request))
    for tag in expired["message"]["order"]["tags"]:
        if tag["descriptor"]["code"] == "TDE_QUOTE":
            tag["list"][0]["value"] = "2000-01-01T00:00:00Z"
    expired_callback = build_on_init(data, expired)
    assert expired_callback["error"]["code"] == "30005"


def test_reinitialization_has_unique_provider_order_and_updated_customer_details():
    data, request = _request()
    selection = build_on_select(data, request)
    order = selection["message"]["order"]
    quote_expires_at = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    item = {"id": order["items"][0]["id"], "provider_id": order["provider"]["id"]}
    first = build_transport_init(
        transaction_id=request["context"]["transaction_id"],
        message_id="33333333-3333-4333-8333-333333333333",
        provider={"id": data["provider"]["bpp_id"], "uri": data["provider"]["bpp_uri"]},
        item=item,
        quantity=1,
        quote=order["quote"],
        fulfillment=order["items"][0]["fulfillment"],
        details={
            "travellers": [{"name": "Original Traveller"}],
            "contact_email": "original@example.com",
            "contact_phone": "1234567890",
        },
        quote_expires_at=quote_expires_at,
    )
    second = build_transport_init(
        transaction_id=request["context"]["transaction_id"],
        message_id="44444444-4444-4444-8444-444444444444",
        provider={"id": data["provider"]["bpp_id"], "uri": data["provider"]["bpp_uri"]},
        item=item,
        quantity=1,
        quote=order["quote"],
        fulfillment=order["items"][0]["fulfillment"],
        details={
            "travellers": [{"name": "Edited Traveller"}],
            "contact_email": "edited@example.com",
            "contact_phone": "1234567891",
        },
        quote_expires_at=quote_expires_at,
    )

    first_order = build_on_init(data, first)["message"]["order"]
    second_order = build_on_init(data, second)["message"]["order"]

    assert first_order["id"] != second_order["id"]
    assert second_order["billing"] == {
        "name": "Edited Traveller",
        "email": "edited@example.com",
        "phone": "1234567891",
    }
    assert second_order["tags"][0]["list"][0]["value"] == "Edited Traveller"
