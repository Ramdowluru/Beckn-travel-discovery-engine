from datetime import datetime, timezone
from typing import Any

from common.order_store import get_order, get_order_owner


def build_on_status(data: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    provider = data["provider"]
    context = {
        **request["context"],
        "action": "on_status",
        "bpp_id": provider["bpp_id"],
        "bpp_uri": provider["bpp_uri"],
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    order_id = request.get("message", {}).get("order_id")
    owner = get_order_owner(provider["bpp_id"], order_id) if isinstance(order_id, str) else None
    order = get_order(provider["bpp_id"], order_id) if isinstance(order_id, str) else None
    if (
        owner is None
        or order is None
        or owner[0] != request["context"].get("transaction_id")
        or owner[1] != request["context"].get("bap_id")
    ):
        return {
            "context": context,
            "error": {"code": "30005", "message": "Provider order was not found for this BAP transaction."},
        }
    return {"context": context, "message": {"order": order}}
