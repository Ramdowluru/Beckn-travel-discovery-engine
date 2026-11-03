from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from common.inventory import confirmation_requirements, quote_total
from common.order_store import confirm_provider_order, get_order, get_order_owner


def _tag_map(tags: list[dict[str, Any]], code: str) -> dict[str, str]:
    for group in tags:
        if isinstance(group, dict) and group.get("descriptor", {}).get("code") == code:
            return {
                entry.get("descriptor", {}).get("code", ""): str(entry.get("value", ""))
                for entry in group.get("list", [])
                if isinstance(entry, dict)
            }
    return {}


def _amount(price: dict[str, Any]) -> Decimal | None:
    try:
        amount = Decimal(str(price.get("value", "")))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return amount if amount.is_finite() and amount >= 0 else None


def _same_price(left: dict[str, Any], right: dict[str, Any]) -> bool:
    left_amount, right_amount = _amount(left), _amount(right)
    return (
        left.get("currency") == right.get("currency")
        and left.get("currency") is not None
        and left_amount is not None
        and left_amount == right_amount
    )


def _error(context: dict[str, Any], code: str, message: str) -> dict[str, Any]:
    return {"context": context, "error": {"code": code, "message": message}}


def build_on_confirm(data: dict[str, Any], request: dict[str, Any], kind: str) -> dict[str, Any]:
    provider = data["provider"]
    context = {
        **request["context"],
        "action": "on_confirm",
        "bpp_id": provider["bpp_id"],
        "bpp_uri": provider["bpp_uri"],
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    submitted = request.get("message", {}).get("order", {})
    order_id = submitted.get("id")
    if not isinstance(order_id, str) or not order_id:
        return _error(context, "30005", "Initialized provider order is missing.")

    owner = get_order_owner(provider["bpp_id"], order_id)
    stored = get_order(provider["bpp_id"], order_id)
    if (
        owner is None
        or stored is None
        or owner[0] != request["context"].get("transaction_id")
        or owner[1] != request["context"].get("bap_id")
        or owner[2] not in {"INITIALIZED", "CONFIRMED"}
    ):
        return _error(context, "30005", "Provider order is not owned by this BAP transaction.")

    accepted = _tag_map(submitted.get("tags", []), "TDE_PRICE_ACCEPTANCE")
    if accepted.get("ACCEPTED") != "true":
        return _error(context, "30005", "Explicit final quote acceptance is required.")
    if (
        submitted.get("provider", {}).get("id") != stored.get("provider", {}).get("id")
        or submitted.get("provider", {}).get("id") != provider["id"]
        or submitted.get("items") != stored.get("items")
        or submitted.get("fulfillments") != stored.get("fulfillments")
        or not _same_price(
            submitted.get("quote", {}).get("price", {}),
            stored.get("quote", {}).get("price", {}),
        )
    ):
        return _error(context, "30006", "Confirmed order does not match the initialized order.")
    if not _same_price(
        {"currency": accepted.get("CURRENCY"), "value": accepted.get("AMOUNT")},
        stored.get("quote", {}).get("price", {}),
    ):
        return _error(context, "30006", "Accepted price does not match the final provider quote.")

    expiry = _tag_map(stored.get("tags", []), "TDE_QUOTE").get("EXPIRES_AT", "")
    try:
        expires_at = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
        if expires_at.tzinfo is None or expires_at <= datetime.now(timezone.utc):
            raise ValueError
    except (TypeError, ValueError):
        return _error(context, "30005", "The initialized provider quote has expired.")

    items = submitted.get("items", [])
    if len(items) != 1 or items[0].get("id") != stored.get("items", [{}])[0].get("id"):
        return _error(context, "30005", "Confirmed item does not match the initialized order.")
    try:
        requirements = confirmation_requirements(data, kind, stored)
        currency, amount = quote_total(data, kind, stored)
    except (KeyError, StopIteration, TypeError, ValueError):
        return _error(context, "30005", "Provider service details are no longer valid.")
    current_price = {"currency": currency, "value": amount}
    if not _same_price(current_price, stored.get("quote", {}).get("price", {})):
        return _error(context, "30006", "The provider price changed. Reinitialize and accept the new quote.")

    if any(payment.get("status") != "NOT-PAID" for payment in stored.get("payments", [])):
        return _error(context, "30005", "This mock provider cannot confirm a paid order.")
    confirmed = deepcopy(stored)
    confirmed["state"] = "CONFIRMED"
    confirmed["tags"] = [
        tag for tag in confirmed.get("tags", [])
        if tag.get("descriptor", {}).get("code") != "TDE_PROVIDER_CONFIRMATION"
    ]
    confirmed["tags"].append({
        "descriptor": {"code": "TDE_PROVIDER_CONFIRMATION"},
        "list": [
            {"descriptor": {"code": "CONFIRMED_AT"}, "value": datetime.now(timezone.utc).isoformat()},
            {"descriptor": {"code": "PROVIDER_REFERENCE"}, "value": order_id},
        ],
    })
    result, saved = confirm_provider_order(
        provider_id=provider["bpp_id"],
        order_id=order_id,
        transaction_id=request["context"]["transaction_id"],
        bap_id=request["context"]["bap_id"],
        message_id=request["context"]["message_id"],
        order=confirmed,
        requirements=requirements,
    )
    if result == "UNAVAILABLE":
        return _error(context, "30005", "Requested inventory is no longer available.")
    if result != "CONFIRMED" or saved is None:
        return _error(context, "30005", "Provider order could not be confirmed.")
    return {"context": context, "message": {"order": saved}}
