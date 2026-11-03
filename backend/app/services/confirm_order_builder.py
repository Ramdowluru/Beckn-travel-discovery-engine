from copy import deepcopy
from datetime import datetime, timezone

from app.core.config import settings
from protocol.contracts import DOMAIN, TTL, VERSION


def build_confirm(
    *,
    transaction_id: str,
    message_id: str,
    provider: dict,
    order: dict,
    accepted_quote: dict[str, str],
) -> dict:
    confirmed_order = deepcopy(order)
    tags = [
        tag for tag in confirmed_order.get("tags", [])
        if tag.get("descriptor", {}).get("code") != "TDE_PRICE_ACCEPTANCE"
    ]
    tags.append({
        "descriptor": {"code": "TDE_PRICE_ACCEPTANCE"},
        "list": [
            {"descriptor": {"code": "ACCEPTED"}, "value": "true"},
            {"descriptor": {"code": "CURRENCY"}, "value": accepted_quote["currency"]},
            {"descriptor": {"code": "AMOUNT"}, "value": accepted_quote["value"]},
        ],
    })
    confirmed_order["tags"] = tags
    return {
        "context": {
            "domain": DOMAIN,
            "version": VERSION,
            "ttl": TTL,
            "action": "confirm",
            "bap_id": settings.bap_id,
            "bap_uri": settings.bap_uri,
            "bpp_id": provider["id"],
            "bpp_uri": provider["uri"],
            "transaction_id": transaction_id,
            "message_id": message_id,
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        },
        "message": {"order": confirmed_order},
    }
