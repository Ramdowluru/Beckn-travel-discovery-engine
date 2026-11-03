import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import get_db
from app.repositories.transport_selections import TransportSelectionRepository
from app.services.booking_validation import validate_confirmed_order
from app.services.selection_session import finish
from protocol.contracts import ProtocolError, ack, validate_message

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


@router.post("/on_confirm")
async def on_confirm(request: Request):
    payload = {}
    try:
        body = await request.body()
        payload = json.loads(body)
        validate_message(payload, "on_confirm")
        identity = request.app.state.beckn_identity
        identity.verify(body, request.headers, payload["context"]["bpp_id"])
        identity.check_address(payload["context"]["bpp_id"], payload["context"]["bpp_uri"])
    except (ProtocolError, ValueError, TypeError, AttributeError, KeyError) as error:
        context = payload.get("context", {}) if isinstance(payload, dict) else {}
        logger.warning(
            "on_confirm rejected stage=signature_or_contract reason=%s transaction_id=%s message_id=%s",
            type(error).__name__,
            context.get("transaction_id", "unknown"),
            context.get("message_id", "unknown"),
        )
        return JSONResponse(ack("Invalid, untrusted or expired confirmation callback"), status_code=400)

    context = payload["context"]
    if context.get("bap_id") != settings.bap_id or context.get("bap_uri") != settings.bap_uri:
        return JSONResponse(ack("Confirmation callback addressed to a different BAP"), status_code=400)
    repository = TransportSelectionRepository(get_db())
    attempt = await repository.get_for_callback(context["transaction_id"], context["message_id"])
    if attempt is None or attempt.get("confirmMessageId") != context["message_id"]:
        return JSONResponse(ack("Unknown confirmation callback"), status_code=400)
    if context.get("bpp_id") != attempt.get("provider", {}).get("id"):
        return JSONResponse(ack("Confirmation provider mismatch"), status_code=400)
    if attempt.get("confirmState") in {"CONFIRMED", "CONFIRM_FAILED"}:
        if attempt.get("confirmedProviderResponse") == payload:
            return ack()
        if not (
            attempt.get("confirmState") == "CONFIRMED"
            and attempt.get("confirmSource") == "ON_STATUS"
            and not payload.get("error")
        ):
            return JSONResponse(ack("Conflicting duplicate confirmation callback"), status_code=400)

    if payload.get("error"):
        updated = await repository.update_confirm(
            selection_id=attempt["selectionId"],
            user_id=attempt["userId"],
            state="CONFIRM_FAILED",
            response=payload,
            error=payload["error"].get("message", "Provider could not confirm this order."),
            expected_states=["CONFIRM_REQUESTED", "PENDING_PROVIDER"],
        )
        if updated is None:
            return JSONResponse(ack("Confirmation callback already processed"), status_code=400)
        finish(context["transaction_id"], context["message_id"], payload)
        return ack()

    order = payload.get("message", {}).get("order", {})
    try:
        validate_confirmed_order(attempt, order)
    except (ProtocolError, TypeError, ValueError, KeyError):
        return JSONResponse(ack("Confirmation order does not match the accepted booking"), status_code=400)

    updated = await repository.update_confirm(
        selection_id=attempt["selectionId"],
        user_id=attempt["userId"],
        state="CONFIRMED",
        response=payload,
        expected_states=["CONFIRM_REQUESTED", "PENDING_PROVIDER"],
    )
    if updated is None:
        current = await repository.get_for_user(attempt["selectionId"], attempt["userId"])
        if (
            current
            and current.get("confirmState") == "CONFIRMED"
            and current.get("confirmedProviderResponse", {}).get("message", {}).get("order") == order
        ):
            finish(context["transaction_id"], context["message_id"], payload)
            return ack()
        return JSONResponse(ack("Confirmation callback already processed"), status_code=400)
    finish(context["transaction_id"], context["message_id"], payload)
    logger.info(
        "on_confirm persisted state=CONFIRMED transaction_id=%s message_id=%s selection_id=%s",
        context["transaction_id"],
        context["message_id"],
        attempt["selectionId"],
    )
    return ack()
