import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import get_db
from app.repositories.transport_selections import TransportSelectionRepository
from app.services.booking_validation import validate_cancelled_order
from app.services.selection_session import finish
from protocol.contracts import ProtocolError, ack, validate_message

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


@router.post("/on_cancel")
async def on_cancel(request: Request):
    payload = {}
    try:
        body = await request.body()
        payload = json.loads(body)
        validate_message(payload, "on_cancel")
        identity = request.app.state.beckn_identity
        context = payload["context"]
        if not context.get("bpp_id") or not context.get("bpp_uri"):
            raise ProtocolError("Cancellation callback sender is missing.")
        identity.verify(body, request.headers, context["bpp_id"])
        identity.check_address(context["bpp_id"], context["bpp_uri"])
    except (ProtocolError, ValueError, TypeError, AttributeError, KeyError) as error:
        context = payload.get("context", {}) if isinstance(payload, dict) else {}
        logger.warning(
            "on_cancel rejected stage=signature_or_contract reason=%s transaction_id=%s message_id=%s",
            type(error).__name__,
            context.get("transaction_id", "unknown"),
            context.get("message_id", "unknown"),
        )
        return JSONResponse(ack("Invalid, untrusted or expired cancellation callback"), status_code=400)

    context = payload["context"]
    if context.get("bap_id") != settings.bap_id or context.get("bap_uri") != settings.bap_uri:
        return JSONResponse(ack("Cancellation callback addressed to a different BAP"), status_code=400)
    repository = TransportSelectionRepository(get_db())
    attempt = await repository.get_for_callback(context["transaction_id"], context["message_id"])
    if attempt is None or attempt.get("cancelMessageId") != context["message_id"]:
        return JSONResponse(ack("Unknown cancellation callback"), status_code=400)
    if (
        context.get("bpp_id") != attempt.get("provider", {}).get("id")
        or context.get("bpp_uri") != attempt.get("provider", {}).get("uri")
        or attempt.get("providerOrder", {}).get("id") != payload.get("message", {}).get("order", {}).get("id")
        and not payload.get("error")
    ):
        return JSONResponse(ack("Cancellation provider or order mismatch"), status_code=400)

    if payload.get("error"):
        if attempt.get("cancelState") == "CANCELLED":
            return JSONResponse(ack("Conflicting cancellation callback"), status_code=400)
        if attempt.get("cancelState") == "CANCEL_REJECTED" and attempt.get("cancelProviderResponse") == payload:
            return ack()
        updated = await repository.update_cancel(
            selection_id=attempt["selectionId"],
            user_id=attempt["userId"],
            state="CANCEL_REJECTED",
            response=payload,
            error=payload["error"].get("message", "Provider could not cancel this order."),
            expected_states=["CANCEL_REQUESTED", "PENDING_PROVIDER"],
        )
        if updated is None:
            current = await repository.get_for_user(attempt["selectionId"], attempt["userId"])
            if (
                current
                and current.get("cancelState") == "CANCEL_REJECTED"
                and current.get("cancelProviderResponse") == payload
            ):
                return ack()
            return JSONResponse(ack("Cancellation callback was already processed"), status_code=400)
        finish(context["transaction_id"], context["message_id"], payload)
        return ack()

    order = payload.get("message", {}).get("order", {})
    try:
        validate_cancelled_order(attempt, order)
    except (ProtocolError, TypeError, ValueError, KeyError):
        return JSONResponse(ack("Cancellation order does not match the confirmed booking"), status_code=400)

    if attempt.get("cancelState") == "CANCELLED":
        stored_order = (
            attempt.get("cancelledProviderResponse", {})
            .get("message", {})
            .get("order")
        )
        if stored_order == order:
            finish(context["transaction_id"], context["message_id"], payload)
            return ack()
        return JSONResponse(ack("Conflicting duplicate cancellation callback"), status_code=400)
    updated = await repository.update_cancel(
        selection_id=attempt["selectionId"],
        user_id=attempt["userId"],
        state="CANCELLED",
        response=payload,
        expected_states=["CANCEL_REQUESTED", "PENDING_PROVIDER", "CANCEL_REJECTED"],
        source="ON_CANCEL",
    )
    if updated is None:
        current = await repository.get_for_user(attempt["selectionId"], attempt["userId"])
        stored_order = (
            current.get("cancelledProviderResponse", {}).get("message", {}).get("order")
            if current
            else None
        )
        if current and current.get("cancelState") == "CANCELLED" and stored_order == order:
            finish(context["transaction_id"], context["message_id"], payload)
            return ack()
        return JSONResponse(ack("Cancellation callback was already processed"), status_code=400)
    finish(context["transaction_id"], context["message_id"], payload)
    logger.info(
        "on_cancel persisted state=CANCELLED transaction_id=%s message_id=%s selection_id=%s",
        context["transaction_id"],
        context["message_id"],
        attempt["selectionId"],
    )
    return ack()
