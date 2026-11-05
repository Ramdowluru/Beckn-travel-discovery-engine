import json
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.core.database import get_db
from app.repositories.transport_selections import TransportSelectionRepository
from app.services.selection_session import finish
from protocol.contracts import ProtocolError, ack, validate_message

router = APIRouter(prefix="/api")


@router.post("/on_init")
async def on_init(request: Request):
    try:
        body = await request.body()
        payload = json.loads(body)
        validate_message(payload, "on_init")
        identity = request.app.state.beckn_identity
        identity.verify(body, request.headers, payload["context"]["bpp_id"])
        identity.check_address(payload["context"]["bpp_id"], payload["context"]["bpp_uri"])
    except (ProtocolError, ValueError, TypeError, AttributeError, KeyError):
        return JSONResponse(ack("Invalid, untrusted or expired initialization callback"), status_code=400)

    context = payload["context"]
    repository = TransportSelectionRepository(get_db())
    attempt = await repository.get_for_callback(context["transaction_id"], context["message_id"])
    if attempt is None or attempt.get("initMessageId") != context["message_id"]:
        return JSONResponse(ack("Unknown initialization callback"), status_code=400)
    if context.get("bpp_id") != attempt.get("provider", {}).get("id"):
        return JSONResponse(ack("Initialization provider mismatch"), status_code=400)
    if attempt.get("initState") in {"INITIALIZED", "INIT_FAILED"}:
        return JSONResponse(ack("Duplicate initialization callback"), status_code=400)
    if payload.get("error"):
        error = payload["error"].get("message", "Provider initialization failed.")
        updated = await repository.update_init(
            selection_id=attempt["selectionId"],
            user_id=attempt["userId"],
            state="INIT_FAILED",
            error=error,
            expected_states=["INIT_REQUESTED", "PENDING_PROVIDER"],
        )
        if updated is None:
            return JSONResponse(ack("Duplicate initialization callback"), status_code=400)
        finish(context["transaction_id"], context["message_id"], payload)
        return ack()

    order = payload.get("message", {}).get("order", {})
    if not order.get("id"):
        return JSONResponse(ack("Initialization order id is missing"), status_code=400)
    if attempt.get("kind") in {"hotel", "experience"} and order.get("state") != "INITIALIZED":
        return JSONResponse(ack("Provider order is not initialized"), status_code=400)
    if order.get("provider", {}).get("id") != attempt["item"]["provider_id"]:
        return JSONResponse(ack("Initialization provider mismatch"), status_code=400)
    items = order.get("items", [])
    if not items or items[0].get("id") != attempt["item"]["id"]:
        return JSONResponse(ack("Initialization item mismatch"), status_code=400)
    selected_count = items[0].get("quantity", {}).get("selected", {}).get("count")
    if selected_count != attempt["requestedQuantity"]:
        return JSONResponse(ack("Initialization quantity mismatch"), status_code=400)
    quote = order.get("quote", {})
    selected_quote = attempt.get("quote", {})
    final_price = quote.get("price", {})
    selected_price = selected_quote.get("price", {})
    if final_price.get("currency") != selected_price.get("currency"):
        return JSONResponse(ack("Initialization currency mismatch"), status_code=400)
    if not isinstance(final_price.get("value"), str):
        return JSONResponse(ack("Initialization quote is invalid"), status_code=400)
    quote_ttl = quote.get("ttl")
    ttl_match = re.fullmatch(r"PT([1-9][0-9]*)(S|M|H)", quote_ttl or "")
    if ttl_match is None:
        return JSONResponse(ack("Initialization quote expiry is invalid"), status_code=400)
    ttl_value = int(ttl_match.group(1))
    ttl_unit = ttl_match.group(2)
    ttl_seconds = ttl_value * {"S": 1, "M": 60, "H": 3600}[ttl_unit]
    if ttl_seconds > 86400:
        return JSONResponse(ack("Initialization quote expiry is invalid"), status_code=400)
    order_expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    try:
        final_value = Decimal(final_price["value"])
        selected_value = Decimal(selected_price["value"])
        if not final_value.is_finite() or final_value < 0 or not selected_value.is_finite():
            raise InvalidOperation
    except (InvalidOperation, TypeError, ValueError):
        return JSONResponse(ack("Initialization quote is invalid"), status_code=400)
    if not isinstance(order.get("payments"), list) or not order["payments"]:
        return JSONResponse(ack("Initialization payment terms are missing"), status_code=400)
    if attempt.get("kind") in {"hotel", "experience"}:
        fulfillments = order.get("fulfillments", [])
        if len(items) != 1 or len(fulfillments) != 1:
            return JSONResponse(ack("Category initialization must contain one item and fulfillment"), status_code=400)
        returned_fulfillment = fulfillments[0] if isinstance(fulfillments, list) and len(fulfillments) == 1 else None
        if returned_fulfillment != attempt.get("fulfillment"):
            return JSONResponse(ack("Initialization dates or fulfillment mismatch"), status_code=400)
        if final_price.get("currency") != selected_price.get("currency"):
            return JSONResponse(ack("Initialization currency mismatch"), status_code=400)
        criteria = attempt.get("criteria", {})
        expected_people = int(
            criteria.get("guests", 0) if attempt["kind"] == "hotel"
            else criteria.get("participants", 0)
        )
        person_tag_code = "TDE_GUESTS" if attempt["kind"] == "hotel" else "TDE_PARTICIPANTS"
        people = next(
            (
                tag.get("list", [])
                for tag in order.get("tags", [])
                if tag.get("descriptor", {}).get("code") == person_tag_code
            ),
            [],
        )
        if attempt["kind"] == "hotel":
            people_count = sum(
                1 for entry in people
                if entry.get("descriptor", {}).get("code") == "NAME"
            )
        else:
            people_count = sum(
                1 for entry in people
                if entry.get("descriptor", {}).get("code") == "NAME"
            )
        if people_count != expected_people:
            return JSONResponse(ack("Initialization guest or participant count mismatch"), status_code=400)
        if any(payment.get("status") != "NOT-PAID" for payment in order["payments"]):
            return JSONResponse(ack("Category initialization cannot represent collected payment"), status_code=400)
        payment_price = order["payments"][0].get("params", {})
        try:
            payment_amount = Decimal(payment_price.get("amount", ""))
            if (
                payment_price.get("currency") != final_price.get("currency")
                or not payment_amount.is_finite()
                or payment_amount != final_value
            ):
                raise InvalidOperation
        except (InvalidOperation, TypeError, ValueError):
            return JSONResponse(ack("Initialization payment terms do not match the final quote"), status_code=400)

    updated = await repository.update_init(
        selection_id=attempt["selectionId"],
        user_id=attempt["userId"],
        state="INITIALIZED",
        order=order,
        details=attempt.get("initDetails"),
        price_changed=final_value != selected_value,
        order_expires_at=order_expires_at,
        expected_states=["INIT_REQUESTED", "PENDING_PROVIDER"],
    )
    if updated is None:
        return JSONResponse(ack("Duplicate initialization callback"), status_code=400)
    finish(context["transaction_id"], context["message_id"], payload)
    return ack()
