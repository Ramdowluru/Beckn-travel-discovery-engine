from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from common.order_store import cancel_provider_order, get_order, get_order_owner


def _error(context: dict[str, Any], message: str) -> dict[str, Any]:
    return {"context": context, "error": {"code": "30005", "message": message}}


def _scheduled_start(order: dict[str, Any], kind: str) -> datetime | None:
    if kind == "hotel":
        tags = order.get("tags", [])
        for group in tags:
            if group.get("descriptor", {}).get("code") == "TDE_HOTEL_BOOKING":
                values = {
                    item.get("descriptor", {}).get("code"): item.get("value")
                    for item in group.get("list", [])
                }
                check_in = values.get("CHECK_IN")
                if isinstance(check_in, str):
                    return datetime.fromisoformat(check_in + "T00:00:00+00:00")
    for fulfillment in order.get("fulfillments", []):
        start = fulfillment.get("start", {}).get("time", {}).get("timestamp")
        if not start:
            start = next(
                (
                    stop.get("time", {}).get("timestamp")
                    for stop in fulfillment.get("stops", [])
                    if stop.get("type") == "START"
                ),
                None,
            )
        if isinstance(start, str):
            moment = datetime.fromisoformat(start.replace("Z", "+00:00"))
            if moment.tzinfo is None:
                return None
            return moment.astimezone(timezone.utc)
    return None


def build_on_cancel(data: dict[str, Any], request: dict[str, Any], kind: str) -> dict[str, Any]:
    provider = data["provider"]
    context = {
        **request["context"],
        "action": "on_cancel",
        "bpp_id": provider["bpp_id"],
        "bpp_uri": provider["bpp_uri"],
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
    }
    message = request.get("message", {})
    order_id = message.get("order_id")
    reason_id = message.get("cancellation_reason_id")
    reason = message.get("descriptor", {}).get("short_desc")
    if reason_id != "TDE_USER_REQUEST" or not isinstance(reason, str) or not reason.strip():
        return _error(context, "A cancellation reason is required.")
    if not isinstance(order_id, str) or not order_id:
        return _error(context, "Provider order reference is missing.")

    transaction_id = request["context"]["transaction_id"]
    bap_id = request["context"]["bap_id"]
    owner = get_order_owner(provider["bpp_id"], order_id)
    stored = get_order(provider["bpp_id"], order_id)
    if owner is None or stored is None or owner[:2] != (transaction_id, bap_id):
        return _error(context, "Provider order was not found for this BAP transaction.")
    if owner[2] == "CANCELLED":
        return {"context": context, "message": {"order": stored}}
    if owner[2] != "CONFIRMED":
        return _error(context, "Only a confirmed provider order can be cancelled.")

    scheduled_start = _scheduled_start(stored, kind)
    if scheduled_start is None:
        return _error(context, "The provider cannot validate this order's cancellation window.")
    if scheduled_start <= datetime.now(timezone.utc):
        return _error(context, "Cancellation is not eligible after the scheduled service start.")

    cancelled = deepcopy(stored)
    cancelled["state"] = "CANCELLED"
    cancelled["status"] = "CANCELLED"
    cancelled["cancellation"] = {
        "time": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "cancelled_by": "CONSUMER",
        "reason": {
            "id": reason_id,
            "descriptor": {"short_desc": reason.strip()},
        },
    }
    cancelled["updated_at"] = cancelled["cancellation"]["time"]
    result, saved = cancel_provider_order(
        provider_id=provider["bpp_id"],
        order_id=order_id,
        transaction_id=transaction_id,
        bap_id=bap_id,
        message_id=request["context"]["message_id"],
        cancelled_order=cancelled,
    )
    if result in {"ALLOCATION_MISSING", "ALLOCATION_INVALID"}:
        return _error(
            context,
            "Provider cannot safely restore this order because its original inventory allocation is unavailable.",
        )
    if result == "UNSAFE_HISTORICAL":
        return _error(
            context,
            "Provider cannot safely cancel this historical order because its original inventory allocation is unavailable.",
        )
    if result != "CANCELLED" or saved is None:
        return _error(context, "Provider order could not be cancelled.")
    return {"context": context, "message": {"order": saved}}
