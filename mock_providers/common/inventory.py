from copy import deepcopy
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from common.order_store import get_inventory_available

IST = timezone(timedelta(hours=5, minutes=30))


def _tag_map(tags: list[dict[str, Any]], code: str) -> dict[str, str]:
    for group in tags:
        if isinstance(group, dict) and group.get("descriptor", {}).get("code") == code:
            return {
                entry.get("descriptor", {}).get("code", ""): str(entry.get("value", ""))
                for entry in group.get("list", [])
                if isinstance(entry, dict)
            }
    return {}


def _search_dates(request: dict[str, Any], kind: str) -> tuple[date, date | None]:
    if kind == "transport":
        from common.beckn_converter import parse_search

        return parse_search(request)[2], None
    intent = request.get("message", {}).get("intent", {})
    fulfillment = intent.get("fulfillment", {})
    start = fulfillment.get("start", {}).get("time", {}).get("range", {}).get("start")
    if kind == "hotel":
        end = fulfillment.get("end", {}).get("time", {}).get("range", {}).get("end")
    else:
        end = None
    return date.fromisoformat(start[:10]), date.fromisoformat(end[:10]) if end else None


def _order_dates(request: dict[str, Any], kind: str) -> tuple[date, date | None]:
    order = request.get("message", {}).get("order", {})
    if kind == "transport":
        explicit = order.get("fulfillment_date")
        if explicit:
            return date.fromisoformat(explicit[:10]), None
    if kind == "hotel":
        tags = _tag_map(order.get("tags", []), "TDE_HOTEL_BOOKING")
        return date.fromisoformat(tags["CHECK_IN"]), date.fromisoformat(tags["CHECK_OUT"])
    fulfillments = order.get("fulfillments", [])
    start = fulfillments[0].get("start", {}).get("time", {}).get("timestamp")
    if not start and fulfillments:
        start = next(
            stop.get("time", {}).get("timestamp")
            for stop in fulfillments[0].get("stops", [])
            if stop.get("type") == "START"
        )
    moment = datetime.fromisoformat(start.replace("Z", "+00:00"))
    return moment.astimezone(IST).date(), None


def inventory_key(kind: str, item_id: str, service_date: date, slot: str = "") -> str:
    return f"{kind}:{item_id}:{service_date.isoformat()}" + (f":{slot}" if slot else "")


def _hotel_id_room_id(item_id: str) -> tuple[str, str] | None:
    parts = item_id.split(":")
    if len(parts) != 3:
        return None
    return parts[1], parts[2]


def with_current_inventory(
    data: dict[str, Any],
    provider_id: str,
    kind: str,
    request: dict[str, Any],
) -> dict[str, Any]:
    """Overlay durable provider availability for the date/slot in this action."""
    result = deepcopy(data)
    action = request.get("context", {}).get("action")
    try:
        if action == "search":
            start, end = _search_dates(request, kind)
        else:
            start, end = _order_dates(request, kind)
    except (KeyError, StopIteration, TypeError, ValueError):
        return result

    if kind == "transport":
        for service in result.get("services", []):
            key = inventory_key(kind, service["service_id"], start)
            service["seats_available"] = get_inventory_available(
                provider_id, key, int(service["seats_available"])
            )
    elif kind == "hotel":
        for hotel in result.get("hotels", []):
            for room in hotel.get("rooms", []):
                initial = int(room["availability"])
                occupied = []
                if end is not None:
                    night = start
                    while night < end:
                        key = inventory_key(kind, f"{hotel['hotel_id']}:{room['room_id']}", night)
                        occupied.append(get_inventory_available(provider_id, key, initial))
                        night += timedelta(days=1)
                room["availability"] = min(occupied) if occupied else 0
    elif kind == "experience":
        for experience in result.get("experiences", []):
            key = inventory_key(
                kind,
                experience["experience_id"],
                start,
                "09:00",
            )
            experience["slots_remaining"] = get_inventory_available(
                provider_id, key, int(experience["slots_remaining"])
            )
    return result


def confirmation_requirements(
    data: dict[str, Any],
    kind: str,
    order: dict[str, Any],
) -> list[tuple[str, int, int]]:
    items = order.get("items", [])
    if len(items) != 1:
        raise ValueError("Confirmation must contain one item.")
    item = items[0]
    quantity = item.get("quantity", {}).get("selected", {}).get("count")
    if not isinstance(quantity, int) or isinstance(quantity, bool) or quantity < 1:
        raise ValueError("Confirmation quantity is invalid.")

    if kind == "transport":
        service = next(
            entry for entry in data["services"] if entry["service_id"] == item["id"]
        )
        fulfillment = order.get("fulfillments", [{}])[0]
        start = fulfillment.get("start", {})
        timestamp = start.get("time", {}).get("timestamp")
        if not timestamp:
            timestamp = next(
                stop["time"]["timestamp"]
                for stop in fulfillment.get("stops", [])
                if stop.get("type") == "START"
            )
        service_date = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).astimezone(IST).date()
        if service_date < datetime.now(IST).date():
            raise ValueError("Transport departure date has passed.")
        return [(
            inventory_key(kind, service["service_id"], service_date),
            quantity,
            int(service["seats_available"]),
        )]

    if kind == "hotel":
        room_ids = _hotel_id_room_id(item["id"])
        if room_ids is None:
            raise ValueError("Hotel room reference is invalid.")
        hotel = next(entry for entry in data["hotels"] if entry["hotel_id"] == room_ids[0])
        room = next(entry for entry in hotel["rooms"] if entry["room_id"] == room_ids[1])
        tags = _tag_map(order.get("tags", []), "TDE_HOTEL_BOOKING")
        check_in = date.fromisoformat(tags["CHECK_IN"])
        check_out = date.fromisoformat(tags["CHECK_OUT"])
        if check_in < datetime.now(IST).date() or check_out <= check_in:
            raise ValueError("Hotel stay dates are invalid.")
        requirements = []
        night = check_in
        while night < check_out:
            requirements.append((
                inventory_key(kind, f"{hotel['hotel_id']}:{room['room_id']}", night),
                quantity,
                int(room["availability"]),
            ))
            night += timedelta(days=1)
        return requirements

    experience = next(
        entry for entry in data["experiences"] if entry["experience_id"] == item["id"]
    )
    fulfillment = order.get("fulfillments", [{}])[0]
    timestamp = fulfillment.get("start", {}).get("time", {}).get("timestamp")
    if not timestamp:
        raise ValueError("Experience time slot is missing.")
    service_date = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).astimezone(IST).date()
    if service_date < datetime.now(IST).date():
        raise ValueError("Experience date has passed.")
    return [(
        inventory_key(kind, experience["experience_id"], service_date, "09:00"),
        quantity,
        int(experience["slots_remaining"]),
    )]


def quote_total(data: dict[str, Any], kind: str, order: dict[str, Any]) -> tuple[str, str]:
    item = order["items"][0]
    quantity = int(item["quantity"]["selected"]["count"])
    if kind == "transport":
        product = next(entry for entry in data["services"] if entry["service_id"] == item["id"])
        amount = product["price"]["amount"] * quantity
        currency = product["price"]["currency"]
    elif kind == "hotel":
        hotel_id, room_id = _hotel_id_room_id(item["id"]) or ("", "")
        hotel = next(entry for entry in data["hotels"] if entry["hotel_id"] == hotel_id)
        room = next(entry for entry in hotel["rooms"] if entry["room_id"] == room_id)
        tags = _tag_map(order.get("tags", []), "TDE_HOTEL_BOOKING")
        nights = (date.fromisoformat(tags["CHECK_OUT"]) - date.fromisoformat(tags["CHECK_IN"])).days
        amount = room["price"]["amount"] * quantity * nights
        currency = room["price"]["currency"]
    else:
        product = next(entry for entry in data["experiences"] if entry["experience_id"] == item["id"])
        amount = product["price"]["amount"] * quantity
        currency = product["price"]["currency"]
    return currency, f"{amount:.2f}"
