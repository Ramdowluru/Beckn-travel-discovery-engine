import asyncio
from typing import Any
import uuid

import httpx
from fastapi import HTTPException, Request

from app.core.config import settings
from app.core.database import get_db
from app.repositories.transport_selections import (
    SelectionConflictError,
    TransportSelectionRepository,
)
from app.services.confirmation import _selection_response
from app.services.selection_session import discard, start
from app.services.status_order_builder import build_status
from protocol.contracts import ProtocolError, require_ack, validate_message
from protocol.signing import signed_post


async def refresh_booking_status(
    *,
    selection_id: str,
    request: Request,
    user: dict[str, Any],
    kind: str | None = None,
) -> dict[str, Any]:
    repository = TransportSelectionRepository(get_db())
    attempt = await repository.get_for_user(selection_id, user["_id"])
    if attempt is None or (kind is not None and attempt.get("kind") != kind):
        raise HTTPException(status_code=404, detail="Booking was not found.")
    order_id = attempt.get("providerOrder", {}).get("id")
    if not isinstance(order_id, str) or not order_id:
        raise HTTPException(
            status_code=409,
            detail="Provider order reference is not available; status cannot yet reconcile this pending initialization.",
        )

    provider = attempt.get("provider", {})
    try:
        trusted_uri = request.app.state.beckn_identity.address(provider["id"])
        request.app.state.beckn_identity.check_address(provider["id"], provider["uri"])
    except (ProtocolError, KeyError) as error:
        raise HTTPException(status_code=502, detail="The selected provider identity is not trusted.") from error

    message_id = str(uuid.uuid4())
    try:
        action = await repository.begin_status(
            attempt=attempt,
            user_id=user["_id"],
            message_id=message_id,
        )
    except SelectionConflictError as error:
        raise HTTPException(status_code=429, detail=str(error)) from error
    if action is None:
        raise HTTPException(status_code=409, detail="Provider order reference changed; refresh the booking and try again.")

    claimed = await repository.claim_status_dispatch(attempt["transactionId"], message_id)
    if claimed is None:
        latest = await repository.get_for_user(selection_id, user["_id"])
        return {**_selection_response(latest or attempt), "status_state": "PENDING"}

    provider = {**provider, "uri": trusted_uri}
    message = build_status(
        transaction_id=attempt["transactionId"],
        message_id=message_id,
        provider=provider,
        order_id=order_id,
    )
    validate_message(message, "status")
    callback_future = start(attempt["transactionId"], message_id)
    try:
        response = await signed_post(
            request.app.state.http_client,
            trusted_uri + "/status",
            message,
            request.app.state.beckn_identity,
        )
        require_ack(response)
        callback = await asyncio.wait_for(callback_future, settings.search_timeout_seconds)
    except asyncio.TimeoutError:
        discard(attempt["transactionId"], message_id)
        await repository.update_status_action(
            transaction_id=attempt["transactionId"],
            message_id=message_id,
            state="PENDING_PROVIDER",
            error="Provider status outcome is unknown.",
            expected_states=["STATUS_REQUESTED"],
        )
        latest = await repository.get_for_user(selection_id, user["_id"])
        return {
            **_selection_response(latest or attempt),
            "status_state": "PENDING_PROVIDER",
            "status_message": "Provider status is pending or unknown; the booking outcome was not changed.",
        }
    except (httpx.RequestError, ProtocolError) as error:
        discard(attempt["transactionId"], message_id)
        await repository.update_status_action(
            transaction_id=attempt["transactionId"],
            message_id=message_id,
            state="STATUS_REJECTED",
            error=type(error).__name__,
            expected_states=["STATUS_REQUESTED"],
        )
        raise HTTPException(status_code=502, detail="The provider status request could not be completed.") from error

    latest = await repository.get_for_user(selection_id, user["_id"])
    status_result = await repository.get_status_action(attempt["transactionId"], message_id)
    return {
        **_selection_response(latest or attempt),
        "status_state": status_result.get("state") if status_result else "STATUS_RECEIVED",
        "provider_status": (latest or {}).get("latestProviderStatus"),
        "status_error": status_result.get("error") if status_result else None,
        "status_response": callback,
    }
