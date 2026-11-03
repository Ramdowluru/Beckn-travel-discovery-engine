from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any
from copy import deepcopy

from app.services.search_session import valid_callbacks


def normalize_transport_callbacks(
    responses: list[dict[str, Any]],
    requested_travellers: int = 1,
    expected_provider_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    """Convert raw transport on_search catalogs into frontend transport options."""
    if isinstance(requested_travellers, bool) or requested_travellers < 1:
        requested_travellers = 1
    options: list[dict[str, Any]] = []
    for response in valid_callbacks(responses, expected_provider_ids or set()):
        context = response.get("context")
        message = response.get("message")
        if not isinstance(context, dict) or not isinstance(message, dict):
            continue

        context_provider_id = _text(context.get("bpp_id"))
        catalog = message.get("catalog")
        providers = catalog.get("providers") if isinstance(catalog, dict) else None
        if not isinstance(providers, list):
            continue

        for provider in providers:
            if not isinstance(provider, dict):
                continue
            provider_id = _text(provider.get("id")) or context_provider_id
            provider_name = _descriptor_text(provider.get("descriptor"), "name")
            if not provider_id or not provider_name:
                continue

            items = provider.get("items")
            if not isinstance(items, list):
                continue
            for item in items:
                # Resolve Beckn references only inside the frontend adapter.
                # Raw callbacks and stored protocol objects remain untouched.
                item = _resolve_relationships(provider, item)
                option = _normalize_item(
                    item,
                    provider_id,
                    provider_name,
                    requested_travellers,
                    context_provider_id,
                    context.get("bpp_uri"),
                )
                if option is not None:
                    options.append(option)
    return options


def _resolve_relationships(provider, item):
    if not isinstance(item, dict) or "fulfillment_ids" not in item:
        return item  # old persisted snapshots/reference tests remain readable
    adapted = deepcopy(item)
    refs = item.get("fulfillment_ids", [])
    fulfillment = next((f for f in provider.get("fulfillments", []) if f.get("id") in refs), None)
    if fulfillment:
        fulfillment = deepcopy(fulfillment)
        stops = fulfillment.get("stops", [])
        fulfillment["start"] = next((s for s in stops if s.get("type") == "START"), {})
        fulfillment["end"] = next((s for s in stops if s.get("type") == "END"), {})
        # Endpoints alone do not assert that no unlisted intermediate stops exist.
        fulfillment.pop("stops", None)
        adapted["fulfillment"] = fulfillment
    adapted["category_id"] = next(iter(item.get("category_ids", [])), "")
    return adapted


def _normalize_item(
    item: Any,
    provider_id: str,
    provider_name: str,
    requested_travellers: int,
    bpp_id: str,
    bpp_uri: str | None,
) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    item_id = _text(item.get("id"))
    price = item.get("price")
    fulfillment = _first_fulfillment(item.get("fulfillment"))
    if not item_id or not isinstance(price, dict) or fulfillment is None:
        return None

    price_value = _decimal(price.get("value"))
    if price_value is None:
        return None
    availability = _availability_count(item.get("quantity"))
    if availability is None or availability < requested_travellers:
        return None

    departure_city = _location_name(fulfillment.get("start"))
    arrival_city = _location_name(fulfillment.get("end"))
    if not departure_city or not arrival_city:
        return None

    mode = _mode(item, fulfillment)
    departure_timestamp = _timestamp_value(fulfillment.get("start"))
    arrival_timestamp = _timestamp_value(fulfillment.get("end"))
    departure = _display_time(departure_timestamp)
    arrival = _display_time(arrival_timestamp)
    duration = _duration_value(
        fulfillment.get("duration"),
        departure_timestamp,
        arrival_timestamp,
    )
    stops = fulfillment.get("stops")
    stop_count = len(stops) - 2 if isinstance(stops, list) and len(stops) >= 2 else None
    currency = _text(price.get("currency")) or ""
    total_price = (price_value * requested_travellers).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
    unit_price = price_value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    price_text = f"{currency} {unit_price:g}".strip()
    descriptor = item.get("descriptor")
    description = ""
    if isinstance(descriptor, dict):
        description = _text(descriptor.get("short_desc")) or _text(descriptor.get("long_desc")) or ""

    result = {
        "id": f"{provider_id}:{item_id}",
        "provider": provider_name,
        "type": mode,
        "departure": departure,
        "departureCity": departure_city,
        "arrival": arrival,
        "arrivalCity": arrival_city,
        "duration": duration,
        "stops": (
            f"{stop_count} stop"
            if stop_count == 1
            else f"{stop_count} stops"
            if stop_count is not None
            else ""
        ),
        "price": price_text,
        "priceNum": float(unit_price),
        "currency": currency,
        "unitPrice": float(unit_price),
        "totalPrice": float(total_price),
        "travellerCount": requested_travellers,
        "description": description,
        "amenities": [],
        "cancellation": "",
        "providerNote": "",
    }
    protocol_availability = int(availability) if availability.is_integer() else availability
    result["_beckn"] = {
        "bpp_id": bpp_id,
        "bpp_uri": bpp_uri,
        "provider_id": provider_id,
        "item_id": item_id,
        "category_id": item.get("category_id", ""),
        "fulfillment": fulfillment,
        "price": {"currency": currency, "value": f"{unit_price:.2f}"},
        "available": protocol_availability,
    }
    return result


def _first_fulfillment(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    if isinstance(value, list):
        return next((entry for entry in value if isinstance(entry, dict)), None)
    return None


def _location_name(stop: Any) -> str:
    if not isinstance(stop, dict):
        return ""
    location = stop.get("location")
    if not isinstance(location, dict):
        return ""
    return _descriptor_text(location.get("descriptor"), "name")


def _timestamp_value(value: Any) -> datetime | None:
    if not isinstance(value, dict):
        return None
    time = value.get("time")
    if isinstance(time, dict):
        timestamp = _parse_timestamp(time.get("timestamp"))
        time_range = time.get("range")
        range_start = time_range.get("start") if isinstance(time_range, dict) else None
        return timestamp or _parse_timestamp(range_start)
    return _parse_timestamp(value.get("timestamp"))


def _parse_timestamp(value: Any) -> datetime | None:
    timestamp = _text(value)
    if not timestamp:
        return None
    try:
        parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else None


def _display_time(value: datetime | None) -> str:
    if value is None:
        return ""
    return value.astimezone(timezone(timedelta(hours=5, minutes=30))).strftime("%H:%M")


def _duration_value(
    value: Any,
    departure: datetime | None,
    arrival: datetime | None,
) -> str:
    explicit = _text(value)
    if explicit:
        return explicit
    if not departure or not arrival:
        return ""
    duration = arrival - departure
    if duration.total_seconds() < 0:
        return ""
    minutes = int(duration.total_seconds() // 60)
    return f"{minutes // 60}h {minutes % 60:02d}m"


def _mode(item: dict[str, Any], fulfillment: dict[str, Any]) -> str:
    raw_mode = item.get("category_id")
    if not raw_mode:
        for tag in item.get("tags", []):
            if not isinstance(tag, dict) or tag.get("descriptor", {}).get("code") != "SERVICE_TYPE":
                continue
            for entry in tag.get("list", []):
                if isinstance(entry, dict) and entry.get("descriptor", {}).get("code") == "TYPE":
                    raw_mode = entry.get("value")
                    break
            if raw_mode:
                break
    modes = {"FLIGHT": "Flight", "TRAIN": "Train", "BUS": "Bus"}
    return modes.get(str(raw_mode).upper(), _text(raw_mode) or "")


def _availability_count(quantity: Any) -> float | None:
    if not isinstance(quantity, dict):
        return None
    available = quantity.get("available")
    if isinstance(available, dict):
        available = available.get("count")
    return _number(available)


def _descriptor_text(value: Any, key: str) -> str:
    return _text(value.get(key)) if isinstance(value, dict) else ""


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def _decimal(value: Any) -> Decimal | None:
    if isinstance(value, bool):
        return None
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return number if number.is_finite() else None
