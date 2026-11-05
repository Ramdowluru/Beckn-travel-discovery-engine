from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from app.services.search_session import valid_callbacks


def normalize_hotel_callbacks(
    responses: list[dict[str, Any]],
    check_in: date | None,
    check_out: date | None,
    rooms: int | None,
    expected_provider_ids: set[str],
) -> list[dict[str, Any]]:
    nights = (check_out - check_in).days if check_in and check_out else 0
    requested_rooms = rooms or 1
    options: list[dict[str, Any]] = []
    for response in valid_callbacks(responses, expected_provider_ids):
        context = response.get("context", {})
        catalog = response.get("message", {}).get("catalog", {})
        providers = catalog.get("providers", []) if isinstance(catalog, dict) else []
        for provider in providers:
            if not isinstance(provider, dict):
                continue
            provider_name = _text(provider.get("descriptor", {}).get("name"))
            provider_id = _text(provider.get("id")) or _text(context.get("bpp_id"))
            if not provider_name or not provider_id:
                continue
            fulfillments = {
                entry.get("id"): entry
                for entry in provider.get("fulfillments", [])
                if isinstance(entry, dict) and entry.get("id")
            }
            details = {
                entry.get("id"): entry
                for entry in provider.get("locations", [])
                if isinstance(entry, dict) and entry.get("id")
            }
            for item in provider.get("items", []):
                if not isinstance(item, dict):
                    continue
                price = item.get("price", {})
                value = _decimal(price.get("value"))
                fulfillment = next(
                    (fulfillments[ref] for ref in item.get("fulfillment_ids", []) if ref in fulfillments),
                    None,
                )
                location = next(
                    (details[ref] for ref in item.get("location_ids", []) if ref in details),
                    {},
                )
                if value is None or fulfillment is None:
                    continue
                nightly = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                total = (nightly * nights * requested_rooms).quantize(
                    Decimal("0.01"), rounding=ROUND_HALF_UP
                )
                tags = _tag_values(item.get("tags"))
                amenities = [value for value in tags.get("AMENITIES", "").split(",") if value]
                images = [value for value in tags.get("IMAGES", "").split(",") if value]
                currency = _text(price.get("currency")) or ""
                options.append({
                    "id": f"{provider_id}:{item.get('id', '')}",
                    "provider": provider_name,
                    "name": _text(item.get("descriptor", {}).get("name")) or "Hotel room",
                    "location": _text(location.get("descriptor", {}).get("name")),
                    "rating": tags.get("RATING", ""),
                    "amenities": amenities,
                    "pricePerNight": f"{currency} {nightly:g}".strip(),
                    "totalPrice": f"{currency} {total:g}".strip(),
                    "nights": nights,
                    "rooms": requested_rooms,
                    "image": images[0] if images else "",
                    "images": images,
                    "description": _text(item.get("descriptor", {}).get("short_desc")),
                    "checkIn": check_in.isoformat() if check_in else "",
                    "checkOut": check_out.isoformat() if check_out else "",
                    "cancellation": "",
                    "providerNote": "Nightly room rate; total includes requested rooms and nights.",
                    "_beckn": {
                        "kind": "hotel",
                        "bpp_id": _text(context.get("bpp_id")),
                        "bpp_uri": _text(context.get("bpp_uri")),
                        "provider_id": provider_id,
                        "item_id": _text(item.get("id")),
                        "fulfillment_id": _text(fulfillment.get("id")),
                        "fulfillment": fulfillment,
                        "location_id": _text(location.get("id")),
                        "room_capacity": _tag_values(item.get("tags")).get("ROOM_CAPACITY"),
                        "price": price,
                        "available_rooms": item.get("quantity", {}).get("available", {}).get("count"),
                        "requested_rooms": requested_rooms,
                        "requested_guests": _tag_values(item.get("tags")).get("GUESTS", ""),
                        "destination": _text(location.get("descriptor", {}).get("name")),
                    },
                })
    return options


def _tag_values(tags: Any) -> dict[str, str]:
    result: dict[str, str] = {}
    for group in tags if isinstance(tags, list) else []:
        for entry in group.get("list", []) if isinstance(group, dict) else []:
            if isinstance(entry, dict) and entry.get("descriptor", {}).get("code"):
                result[entry["descriptor"]["code"]] = _text(entry.get("value"))
    return result


def _decimal(value: Any) -> Decimal | None:
    try:
        return Decimal(str(value))
    except Exception:
        return None


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""
