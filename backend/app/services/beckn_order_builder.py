import uuid
from datetime import datetime, timezone

from app.core.config import settings
from protocol.contracts import DOMAIN, TTL, VERSION


def build_transport_select(
    *,
    transaction_id: str,
    message_id: str,
    provider: dict,
    item: dict,
    fulfillment: dict,
    quantity: int,
    travel_date: str,
) -> dict:
    return {
        "context": {
            "domain": DOMAIN,
            "version": VERSION,
            "ttl": TTL,
            "action": "select",
            "bap_id": settings.bap_id,
            "bap_uri": settings.bap_uri,
            "bpp_id": provider["id"],
            "bpp_uri": provider["uri"],
            "transaction_id": transaction_id,
            "message_id": message_id,
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        },
        "message": {
            "order": {
                "provider": {"id": item["provider_id"]},
                "items": [{
                    "id": item["id"],
                    "quantity": {"selected": {"count": quantity}},
                }],
                # TDE convention used by the local mock providers to revalidate
                # the selected service date without changing Core's order shape.
                "fulfillment_date": travel_date,
            },
        },
    }


def build_transport_init(
    *,
    transaction_id: str,
    message_id: str,
    provider: dict,
    item: dict,
    quantity: int,
    quote: dict,
    fulfillment: dict,
    details: dict,
    quote_expires_at: str,
) -> dict:
    traveller_entries = []
    for traveller in details["travellers"]:
        traveller_entries.append({"descriptor": {"code": "NAME"}, "value": traveller["name"]})
        if traveller.get("gender"):
            traveller_entries.append({"descriptor": {"code": "GENDER"}, "value": traveller["gender"]})

    return {
        "context": {
            "domain": DOMAIN,
            "version": VERSION,
            "ttl": TTL,
            "action": "init",
            "bap_id": settings.bap_id,
            "bap_uri": settings.bap_uri,
            "bpp_id": provider["id"],
            "bpp_uri": provider["uri"],
            "transaction_id": transaction_id,
            "message_id": message_id,
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        },
        "message": {
            "order": {
                "provider": {"id": item["provider_id"]},
                "items": [{
                    "id": item["id"],
                    "quantity": {"selected": {"count": quantity}},
                }],
                "fulfillments": [fulfillment] if fulfillment else [],
                "quote": quote,
                "billing": {
                    "name": details["travellers"][0]["name"],
                    "email": details["contact_email"],
                    "phone": details["contact_phone"],
                },
                "tags": [{
                    "descriptor": {"code": "TRAVELLERS"},
                    "list": traveller_entries,
                }, {
                    "descriptor": {"code": "TDE_QUOTE"},
                    "list": [{
                        "descriptor": {"code": "EXPIRES_AT"},
                        "value": quote_expires_at,
                    }],
                }],
            },
        },
    }
