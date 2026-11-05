from datetime import datetime, timezone

from app.core.config import settings
from protocol.contracts import DOMAIN, TTL, VERSION


def build_status(
    *,
    transaction_id: str,
    message_id: str,
    provider: dict,
    order_id: str,
) -> dict:
    return {
        "context": {
            "domain": DOMAIN,
            "version": VERSION,
            "ttl": TTL,
            "action": "status",
            "bap_id": settings.bap_id,
            "bap_uri": settings.bap_uri,
            "bpp_id": provider["id"],
            "bpp_uri": provider["uri"],
            "transaction_id": transaction_id,
            "message_id": message_id,
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        },
        "message": {"order_id": order_id},
    }
