import asyncio
import hashlib
import httpx
import json
import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import HTTPException, Request

from app.core.config import settings
from app.core.database import get_db
from app.repositories.transport_selections import TransportSelectionRepository
from app.schemas.confirmations import ConfirmRequest
from app.services.booking_cancellation import CANCELLATION_POLICY
from app.services.confirm_order_builder import build_confirm
from app.services.selection_session import discard, start
from protocol.contracts import ProtocolError, require_ack, validate_message
from protocol.signing import signed_post

logger = logging.getLogger(__name__)


def _selection_response(attempt: dict[str, Any]) -> dict[str, Any]:
    return {
        "selection_id": attempt["selectionId"],
        "state": attempt["state"],
        "kind": attempt.get("kind", "transport"),
        "quote": attempt.get("quote"),
        "quote_expires_at": attempt.get("quoteExpiresAt"),
        "init_state": attempt.get("initState"),
        "price_changed": attempt.get("priceChanged", False),
        "order": attempt.get("providerOrder"),
        "confirm_state": attempt.get("confirmState"),
        "accepted_quote": attempt.get("acceptedQuote"),
        "confirmed_order": attempt.get("confirmedProviderResponse"),
        "confirm_error": attempt.get("confirmError"),
        "provider_status": attempt.get("latestProviderStatus"),
        "status_message_id": attempt.get("latestStatusMessageId"),
        "cancel_state": attempt.get("cancelState"),
        "cancel_error": attempt.get("cancelError"),
        "cancelled_order": attempt.get("cancelledProviderResponse"),
        "cancellation_policy": CANCELLATION_POLICY,
    }


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


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
        and left_amount.is_finite()
        and right_amount.is_finite()
        and left_amount == right_amount
    )


async def confirm_initialized_order(
    *,
    selection_id: str,
    payload: ConfirmRequest,
    request: Request,
    user: dict[str, Any],
    kind: str | None = None,
) -> dict[str, Any]:
    repository = TransportSelectionRepository(get_db())
    attempt = await repository.get_for_user(selection_id, user["_id"])
    if attempt is None or (kind is not None and attempt.get("kind") != kind):
        raise HTTPException(status_code=404, detail="Initialized booking was not found.")
    if attempt.get("state") == "CONFIRMED" and attempt.get("confirmState") == "CONFIRMED":
        return _selection_response(attempt)
    if attempt.get("confirmState") in {"CONFIRM_REQUESTED", "PENDING_PROVIDER"}:
        return {**_selection_response(attempt), "state": "PENDING"}
    if attempt.get("confirmState") == "CONFIRM_FAILED":
        raise HTTPException(
            status_code=409,
            detail=attempt.get("confirmError") or "Provider could not confirm this order.",
        )
    if attempt.get("state") != "INITIALIZED" or attempt.get("initState") != "INITIALIZED":
        raise HTTPException(status_code=409, detail="Only an initialized provider order can be confirmed.")

    expiry = attempt.get("providerOrderExpiresAt")
    if not isinstance(expiry, datetime) or _utc(expiry) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=409, detail="The initialized provider quote has expired.")
    order = attempt.get("providerOrder")
    if not isinstance(order, dict) or order.get("state") != "INITIALIZED":
        raise HTTPException(status_code=409, detail="The initialized provider order is invalid.")
    accepted_quote = payload.accepted_quote.model_dump()
    if not _same_price(
        {"currency": accepted_quote["currency"], "value": accepted_quote["value"]},
        order.get("quote", {}).get("price", {}),
    ):
        raise HTTPException(status_code=409, detail="Explicitly accepted price must match the final provider quote.")

    business_material = {
        "selection_id": selection_id,
        "order_id": order.get("id"),
        "accepted_quote": accepted_quote,
    }
    business_key = hashlib.sha256(
        json.dumps(business_material, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    created = await repository.begin_confirm(
        selection_id=selection_id,
        user_id=user["_id"],
        business_key=business_key,
        message_id=str(uuid.uuid4()),
        accepted_quote=accepted_quote,
    )
    if created is None:
        raise HTTPException(status_code=409, detail="The initialized quote expired or confirmation is already in progress.")
    if created.get("confirmState") in {"PENDING_PROVIDER", "CONFIRMED"}:
        return {**_selection_response(created), "state": "PENDING" if created["confirmState"] != "CONFIRMED" else "CONFIRMED"}
    if created.get("confirmState") == "CONFIRM_FAILED":
        raise HTTPException(status_code=409, detail=created.get("confirmError") or "Provider could not confirm this order.")

    claimed = await repository.claim_confirm_dispatch(selection_id, user["_id"])
    if claimed is None:
        latest = await repository.get_for_user(selection_id, user["_id"])
        return {**_selection_response(latest or created), "state": "PENDING"}

    provider = claimed["provider"]
    try:
        trusted_uri = request.app.state.beckn_identity.address(provider["id"])
        request.app.state.beckn_identity.check_address(provider["id"], provider["uri"])
    except (ProtocolError, KeyError) as error:
        await repository.update_confirm(
            selection_id=selection_id,
            user_id=user["_id"],
            state="CONFIRM_FAILED",
            error="Provider identity is not trusted.",
            expected_states=["CONFIRM_REQUESTED"],
        )
        raise HTTPException(status_code=502, detail="Provider identity is not trusted.") from error

    provider = {**provider, "uri": trusted_uri}
    message = build_confirm(
        transaction_id=claimed["transactionId"],
        message_id=claimed["confirmMessageId"],
        provider=provider,
        order=order,
        accepted_quote=accepted_quote,
    )
    try:
        validate_message(message, "confirm")
    except ProtocolError as error:
        await repository.update_confirm(
            selection_id=selection_id,
            user_id=user["_id"],
            state="CONFIRM_FAILED",
            error="Confirmation request did not satisfy the Beckn contract.",
            expected_states=["CONFIRM_REQUESTED"],
        )
        raise HTTPException(status_code=500, detail="Confirmation request could not be validated.") from error

    callback_future = start(claimed["transactionId"], claimed["confirmMessageId"])
    try:
        response = await signed_post(
            request.app.state.http_client,
            trusted_uri + "/confirm",
            message,
            request.app.state.beckn_identity,
        )
        require_ack(response)
        callback = await asyncio.wait_for(callback_future, settings.search_timeout_seconds)
    except (asyncio.TimeoutError, httpx.RequestError):
        discard(claimed["transactionId"], claimed["confirmMessageId"])
        await repository.update_confirm(
            selection_id=selection_id,
            user_id=user["_id"],
            state="PENDING_PROVIDER",
            error="Provider outcome is unknown.",
            expected_states=["CONFIRM_REQUESTED"],
        )
        current = await repository.get_for_user(selection_id, user["_id"])
        return {**_selection_response(current or claimed), "state": "PENDING"}
    except ProtocolError as error:
        discard(claimed["transactionId"], claimed["confirmMessageId"])
        await repository.update_confirm(
            selection_id=selection_id,
            user_id=user["_id"],
            state="CONFIRM_FAILED",
            error="Provider did not acknowledge the confirmation request.",
            expected_states=["CONFIRM_REQUESTED"],
        )
        raise HTTPException(status_code=502, detail="Provider did not acknowledge confirmation.") from error

    if callback.get("error"):
        raise HTTPException(status_code=409, detail=callback["error"].get("message", "Provider could not confirm this order."))
    current = await repository.get_for_user(selection_id, user["_id"])
    if current is None or current.get("confirmState") != "CONFIRMED":
        raise HTTPException(status_code=502, detail="Provider confirmation callback was not persisted.")
    return _selection_response(current)
