from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from common.booking_details import valid_lead_contact, valid_person_names


def parse_hotel_search(request: dict[str, Any]) -> tuple[str, str, str, int, int]:
    intent = request["message"]["intent"]
    fulfillment = intent["fulfillment"]
    destination = fulfillment["location"]["descriptor"]["name"].strip()
    start = fulfillment["start"]["time"]["range"]["start"]
    end = fulfillment["end"]["time"]["range"]["end"]
    counts = {
        tag.get("descriptor", {}).get("code"): tag
        for tag in intent.get("tags", [])
        if isinstance(tag, dict)
    }

    def count(code: str) -> int:
        entries = counts[code].get("list", [])
        value = next(
            entry["value"]
            for entry in entries
            if isinstance(entry, dict)
            and entry.get("descriptor", {}).get("code") == "COUNT"
        )
        return int(value)

    return destination, start, end, count("ROOMS"), count("GUESTS")


def _item(provider: dict[str, Any], hotel: dict[str, Any], room: dict[str, Any],
          rooms: int, guests: int) -> dict[str, Any]:
    hotel_id = hotel["hotel_id"]
    room_id = room["room_id"]
    item_id = f"{provider['bpp_id']}:{hotel_id}:{room_id}"
    category_id = f"{hotel['category']}:accommodation"
    location_id = f"{hotel_id}:location"
    fulfillment_id = f"{hotel_id}:{room_id}:stay"
    price = room["price"]
    return {
        "id": item_id,
        "descriptor": {
            "name": f"{hotel['name']} — {room['name']}",
            "short_desc": f"{hotel['name']} {room['name']} room",
        },
        "category_ids": [category_id],
        "fulfillment_ids": [fulfillment_id],
        "location_ids": [location_id],
        "price": {
            "currency": price["currency"],
            "value": f"{price['amount']:.2f}",
        },
        "quantity": {
            "available": {"count": room["availability"]},
            "requested": {"rooms": rooms, "guests": guests},
        },
        "tags": [{
            "descriptor": {"code": "HOTEL_DETAILS"},
            "list": [
                {"descriptor": {"code": "HOTEL_ID"}, "value": hotel_id},
                {"descriptor": {"code": "ROOM_ID"}, "value": room_id},
                {"descriptor": {"code": "ROOM_NAME"}, "value": room["name"]},
                {"descriptor": {"code": "ROOM_CAPACITY"}, "value": str(room["capacity"])},
                {"descriptor": {"code": "RATING"}, "value": str(hotel["rating"])},
                {"descriptor": {"code": "AMENITIES"}, "value": ",".join(hotel["amenities"])},
                {"descriptor": {"code": "IMAGES"}, "value": ",".join(hotel["images"])},
                {"descriptor": {"code": "ROOMS"}, "value": str(rooms)},
                {"descriptor": {"code": "GUESTS"}, "value": str(guests)},
            ],
        }],
    }


def build_hotel_on_search(data: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    provider = data["provider"]
    destination, start, end, rooms, guests = parse_hotel_search(request)
    matches: list[dict[str, Any]] = []
    eligible = []
    for hotel in data["hotels"]:
        if hotel["city"]["city"].strip().lower() != destination.lower():
            continue
        for room in hotel.get("rooms", []):
            if room.get("availability", 0) < rooms or room.get("capacity", 0) * rooms < guests:
                continue
            matches.append(_item(provider, hotel, room, rooms, guests))
            eligible.append((hotel, room))

    fulfillments = []
    locations: dict[str, dict[str, Any]] = {}
    categories: dict[str, str] = {}
    for hotel, room in eligible:
        fulfillment_id = f"{hotel['hotel_id']}:{room['room_id']}:stay"
        fulfillments.append({
            "id": fulfillment_id,
            "type": "STAY",
            "stops": [
                {
                    "type": "START",
                    "time": {"timestamp": f"{start[:10]}T00:00:00Z"},
                    "location": {"descriptor": {"name": hotel["city"]["city"]}},
                },
                {
                    "type": "END",
                    "time": {"timestamp": f"{end[:10]}T00:00:00Z"},
                    "location": {"descriptor": {"name": hotel["city"]["city"]}},
                },
            ],
        })
        locations[f"{hotel['hotel_id']}:location"] = {
            "id": f"{hotel['hotel_id']}:location",
            "descriptor": {"name": hotel["city"]["city"]},
        }
        categories[f"{hotel['category']}:accommodation"] = hotel["category"].title()
    return {
        "context": {
            **request["context"],
            "action": "on_search",
            "bpp_id": provider["bpp_id"],
            "bpp_uri": provider["bpp_uri"],
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "message": {"catalog": {
            "descriptor": {"name": "Hotel Search Results"},
            "providers": [{
                "id": provider["id"],
                "descriptor": {"name": provider["name"]},
                "categories": [
                    {"id": category_id, "descriptor": {"name": name}}
                    for category_id, name in categories.items()
                ],
                "locations": list(locations.values()),
                "fulfillments": fulfillments,
                "items": matches,
            }],
        }},
    }


def _tag_map(tags: list[dict[str, Any]], code: str) -> dict[str, str]:
        for group in tags:
            if not isinstance(group, dict) or group.get("descriptor", {}).get("code") != code:
                continue
            return {
                entry.get("descriptor", {}).get("code", ""): str(entry.get("value", ""))
                for entry in group.get("list", [])
                if isinstance(entry, dict)
            }
        return {}


def _room(data: dict[str, Any], item_id: str) -> tuple[dict[str, Any], dict[str, Any]] | None:
        parts = item_id.split(":")
        if len(parts) != 3 or parts[0] != data["provider"]["bpp_id"]:
            return None
        hotel = next((entry for entry in data["hotels"] if entry["hotel_id"] == parts[1]), None)
        if hotel is None:
            return None
        room = next((entry for entry in hotel.get("rooms", []) if entry["room_id"] == parts[2]), None)
        return (hotel, room) if room else None


def _hotel_context(request: dict[str, Any], action: str, data: dict[str, Any]) -> dict[str, Any]:
        return {
            **request["context"],
            "action": action,
            "bpp_id": data["provider"]["bpp_id"],
            "bpp_uri": data["provider"]["bpp_uri"],
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }


def _hotel_request_details(request: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], int, int] | None:
        order = request.get("message", {}).get("order", {})
        items = order.get("items", [])
        item = items[0] if isinstance(items, list) and len(items) == 1 and isinstance(items[0], dict) else {}
        quantity = item.get("quantity", {}).get("selected", {}).get("count")
        fulfillment = order.get("fulfillments", [])
        fulfillment = fulfillment[0] if isinstance(fulfillment, list) and len(fulfillment) == 1 else {}
        tags = _tag_map(order.get("tags", []), "TDE_HOTEL_BOOKING")
        try:
            rooms = int(tags["ROOMS"])
            guests = int(tags["GUESTS"])
            check_in = date.fromisoformat(tags["CHECK_IN"])
            check_out = date.fromisoformat(tags["CHECK_OUT"])
        except (KeyError, TypeError, ValueError):
            return None
        if quantity != rooms or rooms < 1 or guests < 1 or check_out <= check_in:
            return None
        return item, fulfillment, rooms, guests


def build_hotel_on_select(data: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
        provider = data["provider"]
        context = _hotel_context(request, "on_select", data)
        details = _hotel_request_details(request)
        order = request.get("message", {}).get("order", {})
        if not details or order.get("provider", {}).get("id") != provider["id"]:
            return {"context": context, "error": {"code": "30005", "message": "Hotel selection details are invalid."}}
        item, fulfillment, rooms, guests = details
        room_data = _room(data, str(item.get("id", "")))
        if room_data is None:
            return {"context": context, "error": {"code": "30004", "message": "Selected room is unavailable."}}
        hotel, room = room_data
        tags = _tag_map(order.get("tags", []), "TDE_HOTEL_BOOKING")
        try:
            check_in = date.fromisoformat(tags["CHECK_IN"])
            check_out = date.fromisoformat(tags["CHECK_OUT"])
            start_stop = next(stop for stop in fulfillment["stops"] if stop.get("type") == "START")
            end_stop = next(stop for stop in fulfillment["stops"] if stop.get("type") == "END")
            start = start_stop["time"]["timestamp"][:10]
            end = end_stop["time"]["timestamp"][:10]
            selected_destination = start_stop["location"]["descriptor"]["name"].strip().lower()
            start_timestamp = start_stop["time"]["timestamp"]
            end_timestamp = end_stop["time"]["timestamp"]
            valid = (
                start == check_in.isoformat()
                and end == check_out.isoformat()
                and start_timestamp == f"{check_in.isoformat()}T00:00:00Z"
                and end_timestamp == f"{check_out.isoformat()}T00:00:00Z"
                and fulfillment.get("id") == f"{hotel['hotel_id']}:{room['room_id']}:stay"
                and selected_destination == hotel["city"]["city"].strip().lower()
                and tags["DESTINATION"].strip().lower() == selected_destination
                and tags["FULFILLMENT_ID"] == f"{hotel['hotel_id']}:{room['room_id']}:stay"
                and check_in >= datetime.now(timezone.utc).date()
            )
        except (KeyError, TypeError, AttributeError, ValueError):
            valid = False
        if not valid or room["availability"] < rooms or room["capacity"] * rooms < guests:
            return {"context": context, "error": {"code": "30005", "message": "Room, dates or guest capacity are unavailable."}}
        nightly = Decimal(str(room["price"]["amount"])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        total = (nightly * (check_out - check_in).days * rooms).quantize(Decimal("0.01"))
        return {
            "context": context,
            "message": {"order": {
                "id": f"order-{request['context']['transaction_id'][:8]}-{request['context']['message_id'][:8]}-{room['room_id']}",
                "state": "SELECTED",
                "provider": {"id": provider["id"], "descriptor": {"name": provider["name"]}},
                "items": [{
                    "id": item["id"],
                    "descriptor": {"name": f"{hotel['name']} — {room['name']}"},
                    "fulfillment": fulfillment,
                    "price": {"currency": room["price"]["currency"], "value": f"{nightly:.2f}"},
                    "quantity": {"selected": {"count": rooms}, "available": {"count": room["availability"]}},
                }],
                "fulfillments": [fulfillment],
                "quote": {"price": {"currency": room["price"]["currency"], "value": f"{total:.2f}"}, "ttl": "PT10M"},
                "tags": order.get("tags", []),
            }},
        }


def build_hotel_on_init(data: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
        selected = build_hotel_on_select(data, {
            **request,
            "context": {**request["context"], "action": "select"},
        })
        context = _hotel_context(request, "on_init", data)
        if selected.get("error"):
            return {"context": context, "error": selected["error"]}
        order = request.get("message", {}).get("order", {})
        selected_order = selected["message"]["order"]
        if selected_order["quote"]["price"]["currency"] != order.get("quote", {}).get("price", {}).get("currency"):
            return {"context": context, "error": {"code": "30006", "message": "Hotel quote currency changed."}}
        expiry = _tag_map(order.get("tags", []), "TDE_QUOTE").get("EXPIRES_AT", "")
        try:
            expires_at = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
            expired = expires_at.tzinfo is None or expires_at <= datetime.now(timezone.utc)
        except ValueError:
            expired = True
        if expired:
            return {"context": context, "error": {"code": "30005", "message": "Hotel quote expired."}}
        submitted_price = order.get("quote", {}).get("price", {})
        try:
            submitted_amount = Decimal(submitted_price.get("value", ""))
            valid_quote = (
                submitted_price.get("currency") == selected_order["quote"]["price"]["currency"]
                and submitted_amount.is_finite()
                and submitted_amount >= 0
            )
        except (InvalidOperation, TypeError, ValueError):
            valid_quote = False
        if not valid_quote:
            return {"context": context, "error": {"code": "30005", "message": "Hotel quote is invalid."}}
        # Core tags use repeated NAME/ROOM descriptors; preserve ordered entries.
        guest_entries = next(
            (tag.get("list", []) for tag in order.get("tags", [])
             if tag.get("descriptor", {}).get("code") == "TDE_GUESTS"),
            [],
        )
        people: list[tuple[str, int]] = []
        pending_name = None
        for entry in guest_entries:
            code = entry.get("descriptor", {}).get("code")
            if code == "NAME":
                pending_name = entry.get("value")
            elif code == "ROOM" and pending_name is not None:
                try:
                    people.append((pending_name, int(entry.get("value"))))
                except (TypeError, ValueError):
                    pass
                pending_name = None
        item_id = order.get("items", [{}])[0].get("id")
        room_data = _room(data, str(item_id))
        quantity = selected_order["items"][0]["quantity"]["selected"]["count"]
        if (
            room_data is None
            or not valid_person_names(
                [name for name, _room in people],
                int(_tag_map(order.get("tags", []), "TDE_HOTEL_BOOKING").get("GUESTS", 0)),
            )
            or any(room < 1 or room > quantity for _name, room in people)
        ):
            return {"context": context, "error": {"code": "30005", "message": "Guest details or room allocation are invalid."}}
        hotel, room = room_data
        if any(sum(1 for _, assigned in people if assigned == index) > room["capacity"] for index in range(1, quantity + 1)):
            return {"context": context, "error": {"code": "30005", "message": "Room guest capacity was exceeded."}}
        billing = order.get("billing", {})
        if not valid_lead_contact(billing):
            return {"context": context, "error": {"code": "30005", "message": "Hotel contact details are incomplete."}}
        return {
            "context": context,
            "message": {"order": {
                **selected_order,
                "id": f"order-{request['context']['transaction_id'][:12]}-{room['room_id']}",
                "state": "INITIALIZED",
                "billing": billing,
                "tags": order.get("tags", []),
                "payments": [{
                    "id": "mock-offline",
                    "collected_by": "bpp",
                    "type": "PRE-ORDER",
                    "status": "NOT-PAID",
                    "params": {
                        "currency": selected_order["quote"]["price"]["currency"],
                        "amount": selected_order["quote"]["price"]["value"],
                    },
                }],
            }},
        }
