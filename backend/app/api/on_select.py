import json
import logging
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.services.selection_session import finish
from app.core.database import get_db
from app.repositories.transport_selections import TransportSelectionRepository
from protocol.contracts import ProtocolError, ack, validate_message

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


@router.post("/on_select")
async def on_select(request: Request):
    payload = {}
    try:
        body = await request.body()
        payload = json.loads(body)
        validate_message(payload, "on_select")
        identity = request.app.state.beckn_identity
        identity.verify(body, request.headers, payload["context"]["bpp_id"])
        identity.check_address(payload["context"]["bpp_id"], payload["context"]["bpp_uri"])
    except (ProtocolError, ValueError, TypeError, AttributeError, KeyError) as error:
        context = payload.get("context", {}) if isinstance(payload, dict) else {}
        logger.warning(
            "on_select rejected stage=signature_or_contract reason=%s transaction_id=%s message_id=%s",
            type(error).__name__,
            context.get("transaction_id", "unknown"),
            context.get("message_id", "unknown"),
        )
        return JSONResponse(ack("Invalid, untrusted or expired selection callback"), status_code=400)
    context = payload["context"]
    repository = TransportSelectionRepository(get_db())
    attempt = await repository.get_for_callback(context["transaction_id"], context["message_id"])
    if attempt is None:
        logger.warning(
            "on_select rejected stage=correlation reason=attempt_not_found transaction_id=%s message_id=%s",
            context["transaction_id"],
            context["message_id"],
        )
        return JSONResponse(ack("Unknown selection callback"), status_code=400)
    if context.get("bpp_id") != attempt.get("provider", {}).get("id"):
        logger.warning(
            "on_select rejected stage=sender reason=unexpected_provider transaction_id=%s message_id=%s",
            context["transaction_id"],
            context["message_id"],
        )
        return JSONResponse(ack("Selection provider mismatch"), status_code=400)
    if attempt["state"] in {"SELECTED", "SELECT_FAILED"}:
        logger.info(
            "on_select rejected stage=idempotency reason=duplicate_callback transaction_id=%s message_id=%s state=%s",
            context["transaction_id"],
            context["message_id"],
            attempt["state"],
        )
        return JSONResponse(ack("Duplicate selection callback"), status_code=400)
    order = payload.get("message", {}).get("order", {})
    if not payload.get("error") and order.get("provider", {}).get("id") != attempt["item"]["provider_id"]:
        return JSONResponse(ack("Selection provider mismatch"), status_code=400)
    items = payload.get("message", {}).get("order", {}).get("items", [])
    if not payload.get("error") and (not items or items[0].get("id") != attempt["item"]["id"]):
        return JSONResponse(ack("Selection item mismatch"), status_code=400)
    if not payload.get("error"):
        selected_count = items[0].get("quantity", {}).get("selected", {}).get("count")
        if selected_count != attempt["requestedQuantity"]:
            return JSONResponse(ack("Selection quantity mismatch"), status_code=400)
        if attempt.get("kind") in {"hotel", "experience"}:
            order = payload["message"]["order"]
            fulfillments = order.get("fulfillments", [])
            if len(items) != 1 or len(fulfillments) != 1:
                return JSONResponse(ack("Category selection must contain one item and fulfillment"), status_code=400)
            returned_fulfillment = fulfillments[0] if isinstance(fulfillments, list) and len(fulfillments) == 1 else None
            expected_fulfillment = attempt.get("fulfillment")
            quote = order.get("quote", {})
            quote_price = quote.get("price", {})
            selected_currency = (attempt.get("snapshotPrice") or {}).get("currency")
            try:
                total = Decimal(quote_price.get("value", ""))
                ttl_match = re.fullmatch(r"PT([1-9][0-9]*)M", quote.get("ttl", ""))
                if (
                    not isinstance(returned_fulfillment, dict)
                    or returned_fulfillment != expected_fulfillment
                    or quote_price.get("currency") != selected_currency
                    or not selected_currency
                    or not total.is_finite()
                    or total < 0
                    or ttl_match is None
                ):
                    raise ValueError
            except (InvalidOperation, TypeError, ValueError):
                return JSONResponse(ack("Category selection dates or quote mismatch"), status_code=400)
    if payload.get("error"):
        state = "SELECT_FAILED"
        quote = None
        error = payload["error"].get("message", "Provider selection failed.")
        quote_expires_at = None
    else:
        state = "SELECTED"
        quote = order.get("quote")
        error = None
        quote_ttl = quote.get("ttl") if isinstance(quote, dict) else None
        quote_expires_at = None
        if isinstance(quote_ttl, str) and quote_ttl.startswith("PT") and quote_ttl.endswith("M"):
            try:
                quote_expires_at = datetime.now(timezone.utc) + timedelta(minutes=int(quote_ttl[2:-1]))
            except ValueError:
                quote_expires_at = None
    updated = await repository.update_result(
        selection_id=attempt["selectionId"],
        user_id=attempt["userId"],
        state=state,
        quote=quote,
        error=error,
        quote_expires_at=quote_expires_at,
        expected_states=["SELECT_REQUESTED", "PENDING_PROVIDER"],
    )
    if updated is None:
        logger.info(
            "on_select rejected stage=persistence reason=state_conflict transaction_id=%s message_id=%s",
            context["transaction_id"],
            context["message_id"],
        )
        return JSONResponse(ack("Selection callback already processed"), status_code=400)
    logger.info(
        "on_select persisted state=%s transaction_id=%s message_id=%s selection_id=%s",
        state,
        context["transaction_id"],
        context["message_id"],
        attempt["selectionId"],
    )
    finish(context["transaction_id"], context["message_id"], payload)
    return ack()
