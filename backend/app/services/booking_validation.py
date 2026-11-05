from copy import deepcopy
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from protocol.contracts import ProtocolError


def _same_price(left: dict[str, Any], right: dict[str, Any]) -> bool:
    if not isinstance(left, dict) or not isinstance(right, dict):
        return False
    try:
        left_amount = Decimal(str(left.get("value", "")))
        right_amount = Decimal(str(right.get("value", "")))
    except (InvalidOperation, TypeError, ValueError):
        return False
    return (
        left.get("currency") == right.get("currency")
        and left.get("currency") is not None
        and left_amount.is_finite()
        and right_amount.is_finite()
        and left_amount == right_amount
    )


def validate_confirmed_order(attempt: dict[str, Any], order: dict[str, Any]) -> None:
    initialized = attempt.get("providerOrder", {})
    if (
        order.get("id") != initialized.get("id")
        or order.get("state") != "CONFIRMED"
        or order.get("provider", {}).get("id") != attempt.get("item", {}).get("provider_id")
    ):
        raise ProtocolError("Confirmation order or provider mismatch.")
    items = order.get("items", [])
    original_items = initialized.get("items", [])
    fulfillments = order.get("fulfillments", [])
    if (
        len(items) != 1
        or len(original_items) != 1
        or items != original_items
        or fulfillments != initialized.get("fulfillments", [])
        or items[0].get("id") != attempt.get("item", {}).get("id")
        or items[0].get("quantity", {}).get("selected", {}).get("count")
            != attempt.get("requestedQuantity")
    ):
        raise ProtocolError("Confirmation item, fulfillment or quantity mismatch.")

    price = order.get("quote", {}).get("price", {})
    accepted_quote = attempt.get("acceptedQuote", {})
    if not _same_price(price, initialized.get("quote", {}).get("price", {})) or not _same_price(
        price,
        accepted_quote,
    ):
        raise ProtocolError("Confirmation quote does not match the accepted final price.")

    payments = order.get("payments", [])
    if not payments or any(payment.get("status") != "NOT-PAID" for payment in payments):
        raise ProtocolError("Mock confirmation cannot represent collected payment.")
    expected_amount = Decimal(price["value"])
    for payment in payments:
        params = payment.get("params", {})
        try:
            payment_amount = Decimal(str(params.get("amount", "")))
        except (InvalidOperation, TypeError, ValueError) as error:
            raise ProtocolError("Confirmation simulated payment terms are invalid.") from error
        if (
            params.get("currency") != price.get("currency")
            or not payment_amount.is_finite()
            or payment_amount != expected_amount
        ):
            raise ProtocolError("Confirmation simulated payment terms do not match the quote.")


def validate_cancelled_order(attempt: dict[str, Any], order: dict[str, Any]) -> None:
    confirmed_response = attempt.get("confirmedProviderResponse", {})
    confirmed = confirmed_response.get("message", {}).get("order", {})
    cancellation = order.get("cancellation", {})
    reason = cancellation.get("reason", {})
    descriptor = reason.get("descriptor", {})
    if (
        not isinstance(confirmed, dict)
        or order.get("id") != confirmed.get("id")
        or order.get("state") != "CANCELLED"
        or order.get("status") != "CANCELLED"
        or cancellation.get("cancelled_by") != "CONSUMER"
        or reason.get("id") != "TDE_USER_REQUEST"
        or descriptor.get("short_desc") != attempt.get("cancelReason")
    ):
        raise ProtocolError("Cancellation order, state or reason does not match the request.")
    cancelled_at = cancellation.get("time")
    try:
        parsed_time = datetime.fromisoformat(cancelled_at.replace("Z", "+00:00"))
    except (AttributeError, TypeError, ValueError) as error:
        raise ProtocolError("Cancellation timestamp is invalid.") from error
    if parsed_time.tzinfo is None:
        raise ProtocolError("Cancellation timestamp must include a timezone.")

    original = deepcopy(confirmed)
    received = deepcopy(order)
    for field in ("state", "status", "cancellation", "updated_at"):
        original.pop(field, None)
        received.pop(field, None)
    if received != original:
        raise ProtocolError("Cancellation changed confirmed booking details.")
    comparable = deepcopy(order)
    comparable["state"] = "CONFIRMED"
    comparable.pop("status", None)
    comparable.pop("cancellation", None)
    comparable.pop("updated_at", None)
    validate_confirmed_order(attempt, comparable)
