import asyncio
import hashlib
import httpx
import json
import logging
import uuid
from typing import Any

from fastapi import HTTPException, Request

from app.core.config import settings
from app.core.database import get_db
from app.repositories.transport_selections import TransportSelectionRepository
from app.schemas.confirmations import CancelRequest
from app.services.cancel_order_builder import build_cancel
from app.services.selection_session import discard, start
from protocol.contracts import ProtocolError, require_ack, validate_message
from protocol.signing import signed_post

logger = logging.getLogger(__name__)

CANCELLATION_POLICY = (
    "Mock policy: request cancellation before the scheduled departure, check-in, or activity start. "
    "There is no cancellation fee; orders are unpaid, so refund is not applicable."
)


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


async def cancel_confirmed_order(
    *,
    selection_id: str,
    payload: CancelRequest,
    request: Request,
    user: dict[str, Any],
    kind: str | None = None,
) -> dict[str, Any]:
    repository = TransportSelectionRepository(get_db())
    attempt = await repository.get_for_user(selection_id, user["_id"])
    if attempt is None or (kind is not None and attempt.get("kind") != kind):
        raise HTTPException(status_code=404, detail="Confirmed booking was not found.")
    if attempt.get("confirmState") in {"CONFIRM_REQUESTED", "PENDING_PROVIDER"}:
        raise HTTPException(
            status_code=409,
            detail="Refresh provider status to resolve the pending confirmation before cancelling.",
        )
    if attempt.get("confirmState") != "CONFIRMED" or attempt.get("state") not in {"CONFIRMED", "CANCELLED"}:
        raise HTTPException(status_code=409, detail="Only a confirmed provider order can be cancelled.")
    if attempt.get("cancelState") in {"CANCEL_REQUESTED", "PENDING_PROVIDER"}:
        return _selection_response(attempt)
    if attempt.get("cancelState") == "CANCELLED":
        return _selection_response(attempt)
    if attempt.get("cancelState") == "CANCEL_REJECTED":
        return _selection_response(attempt)

    order_id = attempt.get("providerOrder", {}).get("id")
    if not isinstance(order_id, str) or not order_id:
        raise HTTPException(status_code=409, detail="Provider order reference is not available.")
    business_key = hashlib.sha256(
        json.dumps(
            {"selection_id": selection_id, "order_id": order_id, "action": "cancel"},
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()
    created = await repository.begin_cancel(
        selection_id=selection_id,
        user_id=user["_id"],
        business_key=business_key,
        message_id=str(uuid.uuid4()),
        reason=payload.reason,
    )
    if created is None:
        raise HTTPException(status_code=409, detail="Cancellation cannot be started for this booking.")
    if created.get("cancelState") != "CANCEL_REQUESTED":
        return _selection_response(created)

    claimed = await repository.claim_cancel_dispatch(selection_id, user["_id"])
    if claimed is None:
        latest = await repository.get_for_user(selection_id, user["_id"])
        return _selection_response(latest or created)

    provider = claimed["provider"]
    try:
        trusted_uri = request.app.state.beckn_identity.address(provider["id"])
        request.app.state.beckn_identity.check_address(provider["id"], provider["uri"])
    except (ProtocolError, KeyError) as error:
        await repository.update_cancel(
            selection_id=selection_id,
            user_id=user["_id"],
            state="CANCEL_REJECTED",
            error="Provider identity is not trusted.",
            expected_states=["CANCEL_REQUESTED"],
        )
        raise HTTPException(status_code=502, detail="Provider identity is not trusted.") from error

    message = build_cancel(
        transaction_id=claimed["transactionId"],
        message_id=claimed["cancelMessageId"],
        provider={**provider, "uri": trusted_uri},
        order_id=order_id,
        reason=claimed["cancelReason"],
    )
    try:
        validate_message(message, "cancel")
    except ProtocolError as error:
        await repository.update_cancel(
            selection_id=selection_id,
            user_id=user["_id"],
            state="CANCEL_REJECTED",
            error="Cancellation request did not satisfy the Beckn contract.",
            expected_states=["CANCEL_REQUESTED"],
        )
        raise HTTPException(status_code=500, detail="Cancellation request could not be validated.") from error

    callback_future = start(claimed["transactionId"], claimed["cancelMessageId"])
    try:
        response = await signed_post(
            request.app.state.http_client,
            trusted_uri + "/cancel",
            message,
            request.app.state.beckn_identity,
        )
        require_ack(response)
        await asyncio.wait_for(callback_future, settings.search_timeout_seconds)
    except (asyncio.TimeoutError, httpx.RequestError):
        discard(claimed["transactionId"], claimed["cancelMessageId"])
        await repository.update_cancel(
            selection_id=selection_id,
            user_id=user["_id"],
            state="PENDING_PROVIDER",
            error="Provider cancellation outcome is unknown.",
            expected_states=["CANCEL_REQUESTED"],
        )
    except ProtocolError:
        discard(claimed["transactionId"], claimed["cancelMessageId"])
        await repository.update_cancel(
            selection_id=selection_id,
            user_id=user["_id"],
            state="CANCEL_REJECTED",
            error="Provider did not accept the cancellation request.",
            expected_states=["CANCEL_REQUESTED"],
        )

    current = await repository.get_for_user(selection_id, user["_id"])
    return _selection_response(current or claimed)
