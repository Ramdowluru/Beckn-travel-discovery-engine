from datetime import datetime, timezone

from app.core.config import settings
from protocol.contracts import DOMAIN, TTL, VERSION


def _context(action: str, transaction_id: str, message_id: str, provider: dict) -> dict:
    return {
        "domain": DOMAIN,
        "version": VERSION,
        "ttl": TTL,
        "action": action,
        "bap_id": settings.bap_id,
        "bap_uri": settings.bap_uri,
        "bpp_id": provider["id"],
        "bpp_uri": provider["uri"],
        "transaction_id": transaction_id,
        "message_id": message_id,
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
    }


def build_category_select(
    *,
    kind: str,
    transaction_id: str,
    message_id: str,
    provider: dict,
    item: dict,
    fulfillment: dict,
    quantity: int,
    criteria: dict,
) -> dict:
    convention = {"descriptor": {"code": f"TDE_{kind.upper()}_BOOKING"}, "list": [
        {"descriptor": {"code": key.upper()}, "value": str(value)}
        for key, value in criteria.items()
    ]}
    return {
        "context": _context("select", transaction_id, message_id, provider),
        "message": {"order": {
            "provider": {"id": item["provider_id"]},
            "items": [{"id": item["id"], "quantity": {"selected": {"count": quantity}}}],
            "fulfillments": [fulfillment],
            "tags": [convention],
        }},
    }


def build_category_init(
    *,
    kind: str,
    transaction_id: str,
    message_id: str,
    provider: dict,
    item: dict,
    fulfillment: dict,
    quantity: int,
    quote: dict,
    quote_expires_at: str,
    details: dict,
    criteria: dict,
) -> dict:
    booking_tag = {
        "descriptor": {"code": f"TDE_{kind.upper()}_BOOKING"},
        "list": [
            {"descriptor": {"code": key.upper()}, "value": str(value)}
            for key, value in criteria.items()
        ],
    }
    person_tag = {
        "descriptor": {"code": "TDE_GUESTS" if kind == "hotel" else "TDE_PARTICIPANTS"},
        "list": [],
    }
    if kind == "hotel":
        for index, person in enumerate(details["people"]):
            person_tag["list"].append({"descriptor": {"code": "NAME"}, "value": person["name"]})
            if person.get("gender"):
                person_tag["list"].append({"descriptor": {"code": "GENDER"}, "value": person["gender"]})
            person_tag["list"].append(
                {"descriptor": {"code": "ROOM"}, "value": str(details["room_assignments"][index])}
            )
    else:
        for person in details["people"]:
            person_tag["list"].append({"descriptor": {"code": "NAME"}, "value": person["name"]})
            if person.get("gender"):
                person_tag["list"].append({"descriptor": {"code": "GENDER"}, "value": person["gender"]})
            if person.get("age") is not None:
                person_tag["list"].append({"descriptor": {"code": "AGE"}, "value": str(person["age"])})
    tags = [
        booking_tag,
        person_tag,
        {"descriptor": {"code": "TDE_QUOTE"}, "list": [
            {"descriptor": {"code": "EXPIRES_AT"}, "value": quote_expires_at},
        ]},
    ]
    return {
        "context": _context("init", transaction_id, message_id, provider),
        "message": {"order": {
            "provider": {"id": item["provider_id"]},
            "items": [{"id": item["id"], "quantity": {"selected": {"count": quantity}}}],
            "fulfillments": [fulfillment],
            "quote": quote,
            "billing": {
                "name": details["people"][0]["name"],
                "email": details["contact_email"],
                "phone": details["contact_phone"],
            },
            "tags": tags,
        }},
    }
