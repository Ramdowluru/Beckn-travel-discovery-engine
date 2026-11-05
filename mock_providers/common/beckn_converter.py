from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, InvalidOperation

from common.booking_details import valid_lead_contact, valid_person_names

IST = timezone(timedelta(hours=5, minutes=30))
EXTRA_FIELDS = ["bus_type", "train_number", "class", "flight_number", "cabin"]


def parse_search(payload: dict) -> tuple[str, str, date, int]:
    fulfillment = payload["message"]["intent"]["fulfillment"]
    names = {
        stop["type"]: stop["location"]["descriptor"]["name"]
        for stop in fulfillment["stops"]
    }
    start_stop = next((s for s in fulfillment["stops"] if s["type"] == "START"), {})
    time_range = start_stop.get("time", {}).get("range", {}) or fulfillment.get("start", {}).get("time", {}).get("range", {})
    start = time_range.get("start")
    travel_date = date.fromisoformat(start[:10]) if start else datetime.now(IST).date()
    requested_travellers = 1
    for tag in payload["message"]["intent"].get("tags", []):
        if not isinstance(tag, dict):
            continue
        descriptor = tag.get("descriptor")
        if not isinstance(descriptor, dict) or descriptor.get("code") != "NUM_TRAVELERS":
            continue
        entries = tag.get("list")
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            entry_descriptor = entry.get("descriptor")
            if not isinstance(entry_descriptor, dict) or entry_descriptor.get("code") != "COUNT":
                continue
            try:
                parsed = int(entry.get("value"))
            except (TypeError, ValueError):
                continue
            if parsed >= 1:
                requested_travellers = parsed
            break
        break
    return names["START"], names["END"], travel_date, requested_travellers


def match_services(services: list[dict], origin: str, destination: str) -> list[dict]:
    origin, destination = origin.strip().lower(), destination.strip().lower()
    return [
        service for service in services
        if service["from"]["city"].lower() == origin and service["to"]["city"].lower() == destination
    ]


def to_utc(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def to_item(service: dict, travel_date: date) -> dict:
    hour, minute = map(int, service["departure_time"].split(":"))
    start = datetime.combine(travel_date, time(hour, minute), tzinfo=IST)
    end = start + timedelta(minutes=service["duration_minutes"])
    tags = [{
        "descriptor": {"code": "SERVICE_TYPE"},
        "list": [{"descriptor": {"code": "TYPE"}, "value": service["mode"]}],
    }]
    details = [
        {"descriptor": {"code": field.upper()}, "value": str(service[field])}
        for field in EXTRA_FIELDS if field in service
    ]
    if details:
        tags.append({"descriptor": {"code": "SERVICE_DETAILS"}, "list": details})
    return {
        "id": service["service_id"],
        "descriptor": {"name": service["name"]},
        "category_ids": [service["mode"]],
        "fulfillment_ids": ["fulfillment-" + service["service_id"]],
        "location_ids": [service["from"]["code"], service["to"]["code"]],
        "_fulfillment": {
            "id": "fulfillment-" + service["service_id"],
            "type": "ROUTE",
            "stops": [
                {"type": "START", "location": {"descriptor": {"name": service["from"]["city"]}}, "time": {"timestamp": to_utc(start)}},
                {"type": "END", "location": {"descriptor": {"name": service["to"]["city"]}}, "time": {"timestamp": to_utc(end)}},
            ],
        },
        "price": {"currency": service["price"]["currency"], "value": f"{service['price']['amount']:.2f}"},
        "quantity": {"available": {"count": service["seats_available"]}},
        "tags": tags,
    }


def build_on_search(data: dict, request: dict) -> dict:
    provider = data["provider"]
    origin, destination, travel_date, requested_travellers = parse_search(request)
    matches = [
        service for service in match_services(data["services"], origin, destination)
        if service.get("seats_available", 0) >= requested_travellers
    ]
    cities = {
        service[end]["code"]: service[end]["city"]
        for service in matches for end in ("from", "to")
    }
    context = {
        **request["context"],
        "action": "on_search",
        "bpp_id": provider["bpp_id"],
        "bpp_uri": provider["bpp_uri"],
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    items = [to_item(service, travel_date) for service in matches]
    fulfillments = [item.pop("_fulfillment") for item in items]
    return {
        "context": context,
        "message": {"catalog": {
            "descriptor": {"name": "Travel Search Results"},
            "providers": [{
                "id": provider["id"],
                "descriptor": {"name": provider["name"]},
                "locations": [{"id": code, "descriptor": {"name": city}} for code, city in cities.items()],
                "categories": [{"id": mode, "descriptor": {"code": mode, "name": mode.title()}}
                               for mode in sorted({service["mode"] for service in matches})],
                "fulfillments": fulfillments,
                "items": items,
            }],
        }},
    }


def build_on_select(data: dict, request: dict) -> dict:
    provider = data["provider"]
    order = request["message"]["order"]
    items = order.get("items", [])
    selected = items[0] if isinstance(items, list) and len(items) == 1 and isinstance(items[0], dict) else {}
    item_id = selected.get("id")
    quantity_data = selected.get("quantity")
    selected_quantity = quantity_data.get("selected") if isinstance(quantity_data, dict) else None
    quantity = selected_quantity.get("count", 0) if isinstance(selected_quantity, dict) else 0
    service = next((entry for entry in data["services"] if entry["service_id"] == item_id), None)
    requested_provider = order.get("provider")
    requested_provider_id = requested_provider.get("id") if isinstance(requested_provider, dict) else None
    context = {
        **request["context"],
        "action": "on_select",
        "bpp_id": provider["bpp_id"],
        "bpp_uri": provider["bpp_uri"],
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    if requested_provider_id != provider["id"] or service is None:
        return {"context": context, "error": {"code": "30004", "message": "Selected service is unavailable."}}
    if not isinstance(quantity, int) or quantity < 1 or quantity > service["seats_available"]:
        return {"context": context, "error": {"code": "30005", "message": "Selected quantity is unavailable."}}
    try:
        travel_date = date.fromisoformat(order.get("fulfillment_date", request["context"]["timestamp"][:10]))
    except (TypeError, ValueError):
        return {"context": context, "error": {"code": "30005", "message": "Selected travel date is invalid."}}
    fulfillment = to_item(service, travel_date)["_fulfillment"]
    total = service["price"]["amount"] * quantity
    return {
        "context": context,
        "message": {"order": {
            "id": f"order-{request['context']['transaction_id'][:8]}-{request['context']['message_id'][:8]}-{item_id}",
            "state": "SELECTED",
            "provider": {"id": provider["id"], "descriptor": {"name": provider["name"]}},
            "items": [{
                "id": item_id,
                "descriptor": {"name": service["name"]},
                "category_id": service["mode"],
                "fulfillment": fulfillment,
                "price": {"currency": service["price"]["currency"], "value": f"{service['price']['amount']:.2f}"},
                "quantity": {"selected": {"count": quantity}, "available": {"count": service["seats_available"]}},
            }],
            "quote": {
                "price": {"currency": service["price"]["currency"], "value": f"{total:.2f}"},
                "ttl": "PT10M",
            },
        }},
    }


def build_on_init(data: dict, request: dict) -> dict:
    provider = data["provider"]
    order = request["message"]["order"]
    items = order.get("items", [])
    selected = items[0] if isinstance(items, list) and len(items) == 1 and isinstance(items[0], dict) else {}
    item_id = selected.get("id")
    quantity_data = selected.get("quantity")
    selected_quantity = quantity_data.get("selected") if isinstance(quantity_data, dict) else None
    quantity = selected_quantity.get("count", 0) if isinstance(selected_quantity, dict) else 0
    requested_tags = order.get("tags")
    if not isinstance(requested_tags, list):
        requested_tags = []
    quote_expiry = None
    for tag in requested_tags:
        descriptor = tag.get("descriptor") if isinstance(tag, dict) else None
        if not isinstance(descriptor, dict) or descriptor.get("code") != "TDE_QUOTE":
            continue
        for entry in tag.get("list", []):
            entry_descriptor = entry.get("descriptor") if isinstance(entry, dict) else None
            if isinstance(entry_descriptor, dict) and entry_descriptor.get("code") == "EXPIRES_AT":
                quote_expiry = entry.get("value")
                break
    service = next((entry for entry in data["services"] if entry["service_id"] == item_id), None)
    requested_provider = order.get("provider")
    requested_provider_id = requested_provider.get("id") if isinstance(requested_provider, dict) else None
    context = {
        **request["context"],
        "action": "on_init",
        "bpp_id": provider["bpp_id"],
        "bpp_uri": provider["bpp_uri"],
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    try:
        expiry = datetime.fromisoformat(quote_expiry.replace("Z", "+00:00"))
        expired = expiry.tzinfo is None or datetime.now(timezone.utc) >= expiry
    except (AttributeError, ValueError):
        expired = True
    if (
        requested_provider_id != provider["id"]
        or service is None
        or expired
        or not isinstance(quantity, int)
        or isinstance(quantity, bool)
        or quantity < 1
        or quantity > service["seats_available"]
    ):
        return {"context": context, "error": {"code": "30005", "message": "Selection is no longer available."}}
    fulfillments = order.get("fulfillments")
    fulfillment = fulfillments[0] if isinstance(fulfillments, list) and len(fulfillments) == 1 else None
    try:
        if "start" in fulfillment and "end" in fulfillment:
            start = fulfillment["start"]
            end = fulfillment["end"]
        else:
            stops = fulfillment["stops"]
            start = next(stop for stop in stops if stop.get("type") == "START")
            end = next(stop for stop in stops if stop.get("type") == "END")
        start_location = start["location"]["descriptor"]["name"].strip().lower()
        end_location = end["location"]["descriptor"]["name"].strip().lower()
        start_timestamp = datetime.fromisoformat(start["time"]["timestamp"].replace("Z", "+00:00"))
        end_timestamp = datetime.fromisoformat(end["time"]["timestamp"].replace("Z", "+00:00"))
        valid_fulfillment = (
            start_timestamp.tzinfo is not None
            and end_timestamp.tzinfo is not None
            and start_timestamp < end_timestamp
            and start_timestamp.astimezone(IST).date() >= datetime.now(IST).date()
            and start_location == service["from"]["city"].strip().lower()
            and end_location == service["to"]["city"].strip().lower()
        )
    except (AttributeError, KeyError, TypeError, ValueError):
        valid_fulfillment = False
    if not valid_fulfillment:
        return {"context": context, "error": {"code": "30005", "message": "Selected travel date or route is no longer valid."}}
    expected_price = service["price"]["amount"] * quantity
    requested_quote = order.get("quote")
    requested_quote = requested_quote if isinstance(requested_quote, dict) else {}
    requested_quote_price = requested_quote.get("price")
    requested_quote_price = requested_quote_price if isinstance(requested_quote_price, dict) else {}
    requested_price = requested_quote_price.get("value")
    try:
        requested_value = Decimal(str(requested_price))
        if (
            requested_quote_price.get("currency") != service["price"]["currency"]
            or not requested_value.is_finite()
            or requested_value < 0
        ):
            raise ValueError
    except (InvalidOperation, TypeError, ValueError):
        return {"context": context, "error": {"code": "30006", "message": "Provider quote is invalid."}}
    travellers = []
    for tag in requested_tags:
        descriptor = tag.get("descriptor") if isinstance(tag, dict) else None
        if isinstance(descriptor, dict) and descriptor.get("code") == "TRAVELLERS":
            travellers = tag.get("list", [])
            break
    if not isinstance(travellers, list):
        travellers = []
    billing = order.get("billing")
    billing = billing if isinstance(billing, dict) else {}
    names = [
        entry.get("value")
        for entry in travellers
        if isinstance(entry, dict)
        and isinstance(entry.get("descriptor"), dict)
        and entry["descriptor"].get("code") == "NAME"
    ]
    if not valid_person_names(names, quantity):
        return {"context": context, "error": {"code": "30005", "message": "Traveller details do not match selected quantity."}}
    if not valid_lead_contact(billing):
        return {"context": context, "error": {"code": "30005", "message": "Contact details are incomplete."}}
    return {
        "context": context,
        "message": {"order": {
            "id": (
                f"order-{request['context']['transaction_id'][:8]}-"
                f"{request['context']['message_id'][:8]}-{item_id}"
            ),
            "state": "INITIALIZED",
            "provider": {"id": provider["id"], "descriptor": {"name": provider["name"]}},
            "billing": billing,
            "fulfillments": order.get("fulfillments", []),
            "items": [{
                "id": item_id,
                "descriptor": {"name": service["name"]},
                "quantity": {"selected": {"count": quantity}, "available": {"count": service["seats_available"]}},
            }],
            "tags": order.get("tags", []),
            "quote": {
                "price": {"currency": service["price"]["currency"], "value": f"{expected_price:.2f}"},
                "ttl": "PT10M",
            },
            "payments": [{
                "id": "mock-offline",
                "collected_by": "bpp",
                "type": "PRE-ORDER",
                "status": "NOT-PAID",
                "params": {"currency": service["price"]["currency"], "amount": f"{expected_price:.2f}"},
            }],
        }},
    }
