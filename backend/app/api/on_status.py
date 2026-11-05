import json
import logging
from copy import deepcopy
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import get_db
from app.repositories.transport_selections import TransportSelectionRepository
from app.services.booking_validation import validate_cancelled_order, validate_confirmed_order
from app.services.selection_session import finish
from protocol.contracts import ProtocolError, ack, validate_message

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


def _same_price(left: dict, right: dict) -> bool:
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


def _validate_status_order(attempt: dict, order: dict) -> None:
    initialized = attempt.get("providerOrder", {})
    if order.get("state") == "CANCELLED":
        if attempt.get("cancelState") not in {
            "CANCEL_REQUESTED",
            "PENDING_PROVIDER",
            "CANCEL_REJECTED",
            "CANCELLED",
        }:
            raise ProtocolError("Provider cancellation has no matching user request.")
        validate_cancelled_order(attempt, order)
        if attempt.get("cancelState") == "CANCELLED":
            stored_order = (
                attempt.get("cancelledProviderResponse", {})
                .get("message", {})
                .get("order")
            )
            if stored_order != order:
                raise ProtocolError("Provider cancellation conflicts with the persisted cancellation.")
        return
    if (
        order.get("id") != initialized.get("id")
        or order.get("state") not in {"INITIALIZED", "CONFIRMED"}
        or order.get("provider", {}).get("id") != attempt.get("item", {}).get("provider_id")
        or order.get("items") != initialized.get("items")
        or order.get("fulfillments") != initialized.get("fulfillments")
        or not _same_price(order.get("quote", {}).get("price", {}), initialized.get("quote", {}).get("price", {}))
    ):
        raise ProtocolError("Provider status does not match the initialized order.")
    items = order.get("items", [])
    original_items = initialized.get("items", [])
    if (
        len(items) != 1
        or len(original_items) != 1
        or items[0].get("id") != attempt.get("item", {}).get("id")
        or items[0].get("quantity", {}).get("selected", {}).get("count")
            != attempt.get("requestedQuantity")
    ):
        raise ProtocolError("Provider status item or quantity mismatch.")
    if order["state"] == "CONFIRMED":
        validate_confirmed_order(attempt, order)
    else:
        expected = deepcopy(initialized)
        expected["state"] = "INITIALIZED"
        if order != expected:
            raise ProtocolError("Provider initialized status changed booking details.")


@router.post("/on_status")
async def on_status(request: Request):
    payload = {}
    try:
        body = await request.body()
        payload = json.loads(body)
        validate_message(payload, "on_status")
        identity = request.app.state.beckn_identity
        context = payload["context"]
        if not context.get("bpp_id") or not context.get("bpp_uri"):
            raise ProtocolError("Status callback sender is missing.")
        identity.verify(body, request.headers, context["bpp_id"])
        identity.check_address(context["bpp_id"], context["bpp_uri"])
    except (ProtocolError, ValueError, TypeError, AttributeError, KeyError) as error:
        context = payload.get("context", {}) if isinstance(payload, dict) else {}
        logger.warning(
            "on_status rejected stage=signature_or_contract reason=%s transaction_id=%s message_id=%s",
            type(error).__name__,
            context.get("transaction_id", "unknown"),
            context.get("message_id", "unknown"),
        )
        return JSONResponse(ack("Invalid, untrusted or expired status callback"), status_code=400)

    context = payload["context"]
    if context.get("bap_id") != settings.bap_id or context.get("bap_uri") != settings.bap_uri:
        return JSONResponse(ack("Status callback addressed to a different BAP"), status_code=400)
    repository = TransportSelectionRepository(get_db())
    matched = await repository.get_status_for_callback(context["transaction_id"], context["message_id"])
    if matched is None:
        return JSONResponse(ack("Unknown status callback"), status_code=400)
    attempt, status_action = matched
    if (
        context.get("bpp_id") != attempt.get("provider", {}).get("id")
        or context.get("bpp_uri") != attempt.get("provider", {}).get("uri")
        or status_action.get("providerId") != context.get("bpp_id")
        or status_action.get("orderId") != attempt.get("providerOrder", {}).get("id")
    ):
        return JSONResponse(ack("Status provider or order mismatch"), status_code=400)

    if status_action.get("state") in {"STATUS_RECEIVED", "STATUS_ERROR"}:
        if status_action.get("response") == payload:
            return ack()
        return JSONResponse(ack("Conflicting duplicate status callback"), status_code=400)

    is_error = "error" in payload
    order = None
    if not is_error:
        order = payload.get("message", {}).get("order")
        try:
            _validate_status_order(attempt, order)
        except (ProtocolError, TypeError, ValueError, KeyError, InvalidOperation):
            return JSONResponse(ack("Status order does not match the user booking"), status_code=400)

    updated_action = await repository.update_status_action(
        transaction_id=context["transaction_id"],
        message_id=context["message_id"],
        state="STATUS_ERROR" if is_error else "STATUS_RECEIVED",
        response=payload,
        error="Provider did not return this order." if is_error else None,
        expected_states=["STATUS_REQUESTED", "PENDING_PROVIDER", "STATUS_REJECTED"],
    )
    if updated_action is None:
        current_action = await repository.get_status_action(context["transaction_id"], context["message_id"])
        if current_action and current_action.get("response") == payload:
            return ack()
        return JSONResponse(ack("Status callback was already processed"), status_code=400)

    repository_latest = None
    if not (
        attempt.get("cancelState") == "CANCELLED"
        and order is not None
        and order.get("state") != "CANCELLED"
    ):
        repository_latest = await repository.update_latest_status(
            selection_id=attempt["selectionId"],
            user_id=attempt["userId"],
            message_id=context["message_id"],
            response=payload,
        )
    if (
        not is_error
        and order is not None
        and order.get("state") == "CONFIRMED"
        and attempt.get("cancelState") != "CANCELLED"
        and attempt.get("confirmState") in {"CONFIRM_REQUESTED", "PENDING_PROVIDER"}
    ):
        reconciled = await repository.update_confirm(
            selection_id=attempt["selectionId"],
            user_id=attempt["userId"],
            state="CONFIRMED",
            response=payload,
            expected_states=["CONFIRM_REQUESTED", "PENDING_PROVIDER"],
            source="ON_STATUS",
        )
        if reconciled is not None:
            logger.info(
                "status reconciled pending confirmation transaction_id=%s message_id=%s selection_id=%s",
                context["transaction_id"],
                context["message_id"],
                attempt["selectionId"],
            )
    if (
        not is_error
        and order is not None
        and order.get("state") == "CANCELLED"
        and attempt.get("cancelState") != "CANCELLED"
    ):
        reconciled = await repository.update_cancel(
            selection_id=attempt["selectionId"],
            user_id=attempt["userId"],
            state="CANCELLED",
            response=payload,
            expected_states=["CANCEL_REQUESTED", "PENDING_PROVIDER", "CANCEL_REJECTED"],
            source="ON_STATUS",
        )
        if reconciled is not None:
            logger.info(
                "status reconciled pending cancellation transaction_id=%s message_id=%s selection_id=%s",
                context["transaction_id"],
                context["message_id"],
                attempt["selectionId"],
            )

    finish(context["transaction_id"], context["message_id"], payload)
    logger.info(
        "on_status persisted state=%s transaction_id=%s message_id=%s selection_id=%s latest=%s",
        order.get("state") if order else "UNKNOWN",
        context["transaction_id"],
        context["message_id"],
        attempt["selectionId"],
        repository_latest is not None,
    )
    return ack()
