from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from common.booking_details import valid_lead_contact, valid_person_names

IST = timezone(timedelta(hours=5, minutes=30))


def _requested_participants(payload: dict) -> int:
    for tag in payload["message"]["intent"].get("tags", []):
        if tag.get("descriptor", {}).get("code") != "NUM_PARTICIPANTS":
            continue
        for entry in tag.get("list", []):
            if entry.get("descriptor", {}).get("code") == "COUNT":
                try:
                    return max(1, int(entry["value"]))
                except (TypeError, ValueError):
                    return 1
    return 1


def _requested_date(payload: dict) -> date:
    start = payload["message"]["intent"]["fulfillment"]["start"]["time"]["range"]["start"]
    return date.fromisoformat(start[:10])


def _destination(payload: dict) -> str:
    return payload["message"]["intent"]["fulfillment"]["location"]["descriptor"]["name"].strip().lower()


def _item(experience: dict, experience_date: date, provider: dict) -> tuple[dict, dict]:
    start = datetime.combine(experience_date, time(9, 0), tzinfo=IST)
    end = start + timedelta(minutes=experience["duration_minutes"])
    fulfillment_id = f"experience-fulfillment-{experience['experience_id']}"
    location_id = experience["city"]["code"]
    category_id = experience["category"]
    fulfillment = {
        "id": fulfillment_id,
        "type": "EXPERIENCE",
        "location": {"id": location_id, "descriptor": {"name": experience["city"]["city"]}},
        "start": {"time": {"timestamp": start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}},
        "end": {"time": {"timestamp": end.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}},
    }
    item = {
        "id": experience["experience_id"],
        "descriptor": {"name": experience["name"], "short_desc": experience["description"]},
        "category_ids": [category_id],
        "fulfillment_ids": [fulfillment_id],
        "location_ids": [location_id],
        "price": {
            "currency": experience["price"]["currency"],
            "value": f"{experience['price']['amount']:.2f}",
        },
        "quantity": {"available": {"count": experience["slots_remaining"]}},
        "tags": [
            {"descriptor": {"code": "DURATION_MINUTES"}, "value": str(experience["duration_minutes"])},
            {"descriptor": {"code": "IMAGES"}, "list": [{"value": image} for image in experience.get("images", [])]},
            {"descriptor": {"code": "HIGHLIGHTS"}, "list": [{"value": value} for value in experience.get("highlights", [])]},
        ],
    }
    return item, fulfillment


def build_experience_on_search(data: dict, request: dict) -> dict:
    provider = data["provider"]
    requested_date = _requested_date(request)
    participants = _requested_participants(request)
    destination = _destination(request)
    matches = [
        experience for experience in data["experiences"]
        if experience["city"]["city"].strip().lower() == destination
        and experience.get("slots_remaining", 0) >= participants
    ]
    items = []
    fulfillments = []
    locations = {}
    categories = {}
    for experience in matches:
        item, fulfillment = _item(experience, requested_date, provider)
        items.append(item)
        fulfillments.append(fulfillment)
        locations[experience["city"]["code"]] = experience["city"]["city"]
        categories[experience["category"]] = experience["category"].title()

    return {
        "context": {
            **request["context"],
            "action": "on_search",
            "bpp_id": provider["bpp_id"],
            "bpp_uri": provider["bpp_uri"],
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "message": {
            "catalog": {
                "descriptor": {"name": "Experience Search Results"},
                "providers": [{
                    "id": provider["id"],
                    "descriptor": {"name": provider["name"]},
                    "locations": [{"id": key, "descriptor": {"name": value}} for key, value in locations.items()],
                    "categories": [{"id": key, "descriptor": {"name": value}} for key, value in categories.items()],
                    "fulfillments": fulfillments,
                    "items": items,
                }],
            },
        },
    }


def _tag_map(tags: list[dict], code: str) -> dict[str, str]:
    for group in tags:
        if isinstance(group, dict) and group.get("descriptor", {}).get("code") == code:
            return {
                entry.get("descriptor", {}).get("code", ""): str(entry.get("value", ""))
                for entry in group.get("list", [])
                if isinstance(entry, dict)
            }
    return {}


def _experience(data: dict, item_id: str) -> dict | None:
    return next(
        (entry for entry in data["experiences"] if entry["experience_id"] == item_id),
        None,
    )


def _context(request: dict, action: str, provider: dict) -> dict:
    return {
        **request["context"],
        "action": action,
        "bpp_id": provider["bpp_id"],
        "bpp_uri": provider["bpp_uri"],
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def _selection_data(request: dict) -> tuple[dict, dict, int, date] | None:
    order = request.get("message", {}).get("order", {})
    items = order.get("items", [])
    item = items[0] if isinstance(items, list) and len(items) == 1 and isinstance(items[0], dict) else {}
    quantity = item.get("quantity", {}).get("selected", {}).get("count")
    fulfillments = order.get("fulfillments", [])
    fulfillment = fulfillments[0] if isinstance(fulfillments, list) and len(fulfillments) == 1 else {}
    tags = _tag_map(order.get("tags", []), "TDE_EXPERIENCE_BOOKING")
    try:
        requested_date = date.fromisoformat(tags["DATE"])
        start = datetime.fromisoformat(fulfillment["start"]["time"]["timestamp"].replace("Z", "+00:00"))
        destination = fulfillment["location"]["descriptor"]["name"].strip().lower()
        if start.astimezone(IST).date() != requested_date:
            return None
    except (KeyError, TypeError, AttributeError, ValueError):
        return None
    if not isinstance(quantity, int) or isinstance(quantity, bool) or quantity < 1:
        return None
    return item, fulfillment, quantity, requested_date


def build_experience_on_select(data: dict, request: dict) -> dict:
    provider = data["provider"]
    context = _context(request, "on_select", provider)
    selection = _selection_data(request)
    order = request.get("message", {}).get("order", {})
    if not selection or order.get("provider", {}).get("id") != provider["id"]:
        return {"context": context, "error": {"code": "30005", "message": "Experience selection details are invalid."}}
    item, fulfillment, quantity, requested_date = selection
    experience = _experience(data, str(item.get("id", "")))
    tags = _tag_map(order.get("tags", []), "TDE_EXPERIENCE_BOOKING")
    if (
        experience is None
        or tags.get("DESTINATION", "").strip().lower() != experience["city"]["city"].strip().lower()
        or fulfillment.get("location", {}).get("descriptor", {}).get("name", "").strip().lower()
            != experience["city"]["city"].strip().lower()
        or requested_date < datetime.now(IST).date()
        or quantity > experience.get("slots_remaining", 0)
        or tags.get("FULFILLMENT_ID") != f"experience-fulfillment-{experience['experience_id']}"
    ):
        return {"context": context, "error": {"code": "30005", "message": "Experience date or capacity is unavailable."}}
    start = datetime.combine(requested_date, time(9, 0), tzinfo=IST)
    end = start + timedelta(minutes=experience["duration_minutes"])
    fulfillment = {
        "id": f"experience-fulfillment-{experience['experience_id']}",
        "type": "EXPERIENCE",
        "location": {"id": experience["city"]["code"], "descriptor": {"name": experience["city"]["city"]}},
        "start": {"time": {"timestamp": start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}},
        "end": {"time": {"timestamp": end.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}},
    }
    if fulfillment != order.get("fulfillments", [{}])[0]:
        return {"context": context, "error": {"code": "30005", "message": "Experience date or time is unavailable."}}
    unit_price = Decimal(str(experience["price"]["amount"])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    total = (unit_price * quantity).quantize(Decimal("0.01"))
    return {
        "context": context,
        "message": {"order": {
            "id": f"order-{request['context']['transaction_id'][:12]}-{experience['experience_id']}",
            "state": "SELECTED",
            "provider": {"id": provider["id"], "descriptor": {"name": provider["name"]}},
            "items": [{
                "id": experience["experience_id"],
                "descriptor": {"name": experience["name"]},
                "fulfillment": fulfillment,
                "price": {"currency": experience["price"]["currency"], "value": f"{unit_price:.2f}"},
                "quantity": {"selected": {"count": quantity}, "available": {"count": experience["slots_remaining"]}},
            }],
            "fulfillments": [fulfillment],
            "quote": {"price": {"currency": experience["price"]["currency"], "value": f"{total:.2f}"}, "ttl": "PT10M"},
            "tags": order.get("tags", []),
        }},
    }


def build_experience_on_init(data: dict, request: dict) -> dict:
    provider = data["provider"]
    context = _context(request, "on_init", provider)
    order = request.get("message", {}).get("order", {})
    selected = build_experience_on_select(data, {
        **request,
        "context": {**request["context"], "action": "select"},
    })
    if selected.get("error"):
        return {"context": context, "error": selected["error"]}
    selected_order = selected["message"]["order"]
    quote_currency = order.get("quote", {}).get("price", {}).get("currency")
    if quote_currency != selected_order["quote"]["price"]["currency"]:
        return {"context": context, "error": {"code": "30006", "message": "Experience quote currency changed."}}
    expiry = _tag_map(order.get("tags", []), "TDE_QUOTE").get("EXPIRES_AT", "")
    try:
        expires_at = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
        expired = expires_at.tzinfo is None or expires_at <= datetime.now(timezone.utc)
    except ValueError:
        expired = True
    if expired:
        return {"context": context, "error": {"code": "30005", "message": "Experience quote expired."}}
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
        return {"context": context, "error": {"code": "30005", "message": "Experience quote is invalid."}}
    participant_tag = next(
        (tag.get("list", []) for tag in order.get("tags", [])
         if tag.get("descriptor", {}).get("code") == "TDE_PARTICIPANTS"),
        [],
    )
    names = [
        entry.get("value")
        for entry in participant_tag
        if entry.get("descriptor", {}).get("code") == "NAME"
    ]
    quantity = selected_order["items"][0]["quantity"]["selected"]["count"]
    billing = order.get("billing", {})
    if (
        not valid_person_names(names, quantity)
        or not valid_lead_contact(billing)
    ):
        return {"context": context, "error": {"code": "30005", "message": "Participant or contact details are invalid."}}
    return {
        "context": context,
        "message": {"order": {
            **selected_order,
            "id": f"order-{request['context']['transaction_id'][:8]}-{request['context']['message_id'][:8]}-{selected_order['items'][0]['id']}",
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
