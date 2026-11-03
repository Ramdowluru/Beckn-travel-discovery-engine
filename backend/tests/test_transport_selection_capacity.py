import json
from pathlib import Path

from app.services.transport_normalizer import normalize_transport_callbacks
from common.beckn_converter import build_on_select
from app.services.beckn_order_builder import build_transport_select
from protocol.contracts import validate_message
from app.schemas.selections import TransportSelectionRequest


def _callback():
    data = json.loads(Path("mock_providers/mock_bus/data.json").read_text(encoding="utf-8"))
    request = build_transport_select(
        transaction_id="11111111-1111-4111-8111-111111111111",
        message_id="22222222-2222-4222-8222-222222222222",
        provider={"id": data["provider"]["bpp_id"], "uri": data["provider"]["bpp_uri"]},
        item={"id": "BUS-001", "provider_id": data["provider"]["id"]},
        fulfillment={},
        quantity=1,
        travel_date="2026-10-28",
    )
    callback = build_on_select(data, request)
    return data, request, callback


def test_discovery_preserves_integral_inventory_capacity_as_integer():
    data, request, callback = _callback()
    callback["context"]["action"] = "on_search"
    callback["message"] = {
        "catalog": {
            "providers": [{
                "id": data["provider"]["id"],
                "descriptor": {"name": data["provider"]["name"]},
                "fulfillments": [],
                "locations": [],
                "categories": [],
                "items": [],
            }],
        },
    }

    # Use the real discovery converter shape to verify the metadata boundary.
    from common.beckn_converter import build_on_search
    search = dict(request)
    search["context"] = {**request["context"], "action": "search"}
    search["message"] = {"intent": {
        "fulfillment": {
            "stops": [
                {"type": "START", "location": {"descriptor": {"name": "Vijayawada"}}, "time": {"range": {"start": "2026-10-28T00:00:00Z", "end": "2026-10-28T23:59:59Z"}}},
                {"type": "END", "location": {"descriptor": {"name": "Hyderabad"}}},
            ],
        },
        "tags": [{"descriptor": {"code": "NUM_TRAVELERS"}, "list": [{"descriptor": {"code": "COUNT"}, "value": "1"}]}],
    }}
    discovery = build_on_search(data, search)
    normalized = normalize_transport_callbacks([discovery], requested_travellers=1, expected_provider_ids={data["provider"]["bpp_id"]})
    bus = next(option for option in normalized if option["id"] == "mock-bus:BUS-001")
    assert bus["_beckn"]["available"] == 28
    assert isinstance(bus["_beckn"]["available"], int)


def test_provider_accepts_capacity_boundary_and_rejects_above_capacity():
    data, request, _ = _callback()
    request["message"]["order"]["items"][0]["quantity"]["selected"]["count"] = 28
    callback = build_on_select(data, request)
    validate_message(callback, "on_select", fresh=False)
    assert callback["message"]["order"]["items"][0]["quantity"]["selected"]["count"] == 28

    request["context"]["message_id"] = "33333333-3333-4333-8333-333333333333"
    request["message"]["order"]["items"][0]["quantity"]["selected"]["count"] = 29
    callback = build_on_select(data, request)
    validate_message(callback, "on_select", fresh=False)
    assert callback["error"]["code"] == "30005"


def test_selection_request_allows_inventory_capacity_boundary():
    assert TransportSelectionRequest(quantity=28).quantity == 28
    try:
        TransportSelectionRequest(quantity=0)
    except ValueError:
        pass
    else:
        raise AssertionError("zero quantity must remain invalid")
