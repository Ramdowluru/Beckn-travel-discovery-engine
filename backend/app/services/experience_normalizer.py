from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

IST = timezone(timedelta(hours=5, minutes=30))


def _tag_value(item: dict, code: str) -> str:
    for tag in item.get("tags", []):
        if tag.get("descriptor", {}).get("code") == code:
            if "value" in tag:
                return str(tag["value"])
            values = tag.get("list", [])
            return str(values[0].get("value", "")) if values else ""
    return ""


def normalize_experience_callbacks(
    callbacks: list[dict],
    requested_date: date | None,
    participants: int,
    expected_ids: set[str],
) -> list[dict]:
    results = []
    for callback in callbacks:
        context = callback.get("context", {})
        if expected_ids and context.get("bpp_id") not in expected_ids:
            continue
        for provider in callback.get("message", {}).get("catalog", {}).get("providers", []):
            locations = {entry.get("id"): entry.get("descriptor", {}).get("name", "") for entry in provider.get("locations", [])}
            categories = {entry.get("id"): entry.get("descriptor", {}).get("name", entry.get("id", "")) for entry in provider.get("categories", [])}
            fulfillments = {entry.get("id"): entry for entry in provider.get("fulfillments", [])}
            for item in provider.get("items", []):
                fulfillment = fulfillments.get((item.get("fulfillment_ids") or [""])[0], {})
                location_id = (item.get("location_ids") or [""])[0]
                price = item.get("price", {})
                try:
                    amount = Decimal(str(price.get("value", "0"))).quantize(
                        Decimal("0.01"), rounding=ROUND_HALF_UP
                    )
                except (InvalidOperation, ValueError):
                    continue
                available = item.get("quantity", {}).get("available", {}).get("count")
                try:
                    available_count = int(available)
                except (TypeError, ValueError):
                    available_count = 0
                start = fulfillment.get("start", {}).get("time", {}).get("timestamp", "")
                end = fulfillment.get("end", {}).get("time", {}).get("timestamp", "")
                images = next(
                    (tag.get("list", []) for tag in item.get("tags", [])
                     if tag.get("descriptor", {}).get("code") == "IMAGES"),
                    [],
                )
                results.append({
                    "id": f"{context.get('bpp_id', '')}:{item.get('id', '')}",
                    "provider": provider.get("descriptor", {}).get("name", context.get("bpp_id", "")),
                    "name": item.get("descriptor", {}).get("name", ""),
                    "duration": _duration(_tag_value(item, "DURATION_MINUTES")),
                    "price": f"{price.get('currency', '')} {amount:.2f} / person".strip(),
                    "priceNum": float(amount),
                    "totalPrice": f"{price.get('currency', '')} {(amount * participants).quantize(Decimal('0.01')):.2f}".strip(),
                    "participants": participants,
                    "availability": available_count,
                    "date": requested_date.isoformat() if requested_date else start[:10],
                    "time": _time_range(start, end),
                    "rating": "—",
                    "category": _display_category(categories.get((item.get("category_ids") or [""])[0], "Experience")),
                    "image": images[0].get("value", "") if images else "",
                    "images": [entry.get("value", "") for entry in images],
                    "description": item.get("descriptor", {}).get("short_desc", ""),
                    "includes": [],
                    "meetingPoint": locations.get(location_id, ""),
                    "cancellation": "Provider policy applies",
                    "providerNote": "Independent mock experience provider",
                    "_beckn": {
                        "kind": "experience",
                        "bpp_id": context.get("bpp_id", ""),
                        "bpp_uri": context.get("bpp_uri", ""),
                        "provider_id": provider.get("id", ""),
                        "item_id": item.get("id", ""),
                        "fulfillment_id": fulfillment.get("id", ""),
                        "fulfillment": fulfillment,
                        "location_id": location_id,
                        "price": price,
                        "available_participants": available_count,
                        "requested_participants": participants,
                        "destination": locations.get(location_id, ""),
                    },
                })
    return results


def _duration(value: str) -> str:
    try:
        minutes = int(value)
    except ValueError:
        return "—"
    return f"{minutes // 60}h {minutes % 60:02d}m" if minutes >= 60 else f"{minutes}m"


def _display_category(value: str) -> str:
    return {
        "Walking_Tour": "Culture",
        "Food": "Food",
        "Adventure": "Adventure",
        "Sightseeing": "Nature",
        "Water": "Nature",
    }.get(value, value)


def _time_range(start: str, end: str) -> str:
    if not start:
        return "Time to be confirmed"
    try:
        start_time = datetime.fromisoformat(start.replace("Z", "+00:00")).astimezone(IST).strftime("%H:%M")
        end_time = datetime.fromisoformat(end.replace("Z", "+00:00")).astimezone(IST).strftime("%H:%M") if end else ""
        return f"{start_time}–{end_time}" if end_time else start_time
    except ValueError:
        return "Time to be confirmed"
