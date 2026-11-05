import asyncio
import hashlib
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pymongo.errors import PyMongoError

from app.core.config import settings
from app.core.database import get_db
from app.core.security import require_browser_write
from app.dependencies.auth import get_current_user
from app.repositories.transport_selections import TransportSelectionRepository
from app.repositories.transport_snapshots import SnapshotExpiredError, SnapshotNotFoundError, TransportSnapshotRepository
from app.schemas.confirmations import CancelRequest, ConfirmRequest
from app.schemas.selections import TransportInitRequest, TransportSelectionRequest
from app.services.beckn_order_builder import build_transport_init, build_transport_select
from app.services.booking_cancellation import CANCELLATION_POLICY, cancel_confirmed_order
from app.services.confirmation import confirm_initialized_order
from app.services.booking_status import refresh_booking_status
from app.services.selection_session import discard, finish, start
from protocol.contracts import ProtocolError, prepare_order_validation, require_ack, validate_message
from protocol.signing import signed_post

router = APIRouter(prefix="/api/transport", tags=["transport-selection"])
logger = logging.getLogger(__name__)


def _utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _selection_response(attempt: dict) -> dict:
    return {
        "selection_id": attempt["selectionId"],
        "state": attempt["state"],
        "quote": attempt.get("quote"),
        "quote_expires_at": attempt.get("quoteExpiresAt"),
        "init_state": attempt.get("initState"),
        "price_changed": attempt.get("priceChanged", False),
        "order": attempt.get("providerOrder"),
        "customer_details": attempt.get("initDetails"),
        "booking_display": attempt.get("bookingDisplay", {}),
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


@router.post("/{offer_id}/select")
async def select_transport(
    offer_id: str,
    payload: TransportSelectionRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    require_browser_write(request)
    try:
        snapshot = await TransportSnapshotRepository(
            get_db(), settings.transport_snapshot_ttl_seconds
        ).get(transaction_id=request.query_params.get("transaction_id", ""), offer_id=offer_id)
    except (SnapshotExpiredError, SnapshotNotFoundError) as error:
        raise HTTPException(status_code=404, detail="This transport offer has expired. Please search again.") from error
    except PyMongoError as error:
        raise HTTPException(status_code=503, detail="Transport selection is temporarily unavailable.") from error

    protocol = snapshot["offer"].get("_beckn")
    if not isinstance(protocol, dict):
        raise HTTPException(status_code=409, detail="This discovery result cannot be selected. Please search again.")
    available = protocol.get("available")
    if not isinstance(available, int) or payload.quantity > available:
        raise HTTPException(status_code=409, detail="The requested quantity is no longer available.")
    provider_id = protocol.get("bpp_id")
    provider_uri = protocol.get("bpp_uri")
    if not isinstance(provider_id, str) or not isinstance(provider_uri, str):
        raise HTTPException(status_code=409, detail="The provider identity is no longer trusted.")
    try:
        trusted_uri = request.app.state.beckn_identity.address(provider_id)
        request.app.state.beckn_identity.check_address(provider_id, provider_uri)
    except ProtocolError as error:
        raise HTTPException(status_code=502, detail="The provider identity is not trusted.") from error

    transaction_id = snapshot["transaction_id"]
    business_key = f"{transaction_id}:{offer_id}:{payload.quantity}"
    message_id = str(uuid.uuid4())
    repository = TransportSelectionRepository(get_db())
    attempt = await repository.create_or_get(
        user_id=user["_id"],
        business_key=business_key,
        transaction_id=transaction_id,
        snapshot={
            "provider": {"id": provider_id, "uri": trusted_uri},
            "item": {"id": protocol["item_id"], "provider_id": protocol["provider_id"]},
            "fulfillment": protocol["fulfillment"],
            "price": protocol["price"],
        },
        quantity=payload.quantity,
        message_id=message_id,
        criteria=snapshot.get("query", {}),
        display={key: value for key, value in snapshot["offer"].items() if key != "_beckn"},
    )
    if attempt["state"] == "SELECTED":
        return _selection_response(attempt)
    if attempt["state"] == "PENDING_PROVIDER":
        return {
            "selection_id": attempt["selectionId"],
            "state": "PENDING",
            "message": "Provider outcome is still unknown; check selection status before retrying.",
        }
    if attempt["state"] == "SELECT_REQUESTED":
        claimed = await repository.claim_dispatch(attempt["selectionId"], user["_id"])
        if claimed is None:
            logger.info(
                "select dispatch not claimed transaction_id=%s message_id=%s selection_id=%s",
                attempt["transactionId"],
                attempt["messageId"],
                attempt["selectionId"],
            )
            return {
                "selection_id": attempt["selectionId"],
                "state": "PENDING",
                "message": "This selection is already being sent to the provider.",
            }
        attempt = claimed
        message_id = attempt["messageId"]
        logger.info(
            "select dispatch started transaction_id=%s message_id=%s selection_id=%s provider_id=%s",
            transaction_id,
            message_id,
            attempt["selectionId"],
            provider_id,
        )
    else:
        raise HTTPException(status_code=409, detail=f"Selection is already {attempt['state'].lower()}.")

    message = build_transport_select(
        transaction_id=transaction_id,
        message_id=message_id,
        provider={"id": provider_id, "uri": trusted_uri},
        item=attempt["item"],
        fulfillment=attempt["fulfillment"],
        quantity=payload.quantity,
        travel_date=snapshot["query"]["date"],
    )
    validate_message(message, "select")
    callback_future = start(transaction_id, message_id)
    try:
        response = await signed_post(request.app.state.http_client, trusted_uri + "/select", message, request.app.state.beckn_identity)
        require_ack(response)
        logger.info(
            "select provider ack transaction_id=%s message_id=%s selection_id=%s status=%s",
            transaction_id,
            message_id,
            attempt["selectionId"],
            response.status_code,
        )
        callback = await asyncio.wait_for(callback_future, settings.search_timeout_seconds)
    except asyncio.TimeoutError:
        discard(transaction_id, message_id)
        updated = await repository.update_result(
            selection_id=attempt["selectionId"],
            user_id=user["_id"],
            state="PENDING_PROVIDER",
            quote=None,
            error="Provider outcome is unknown; status reconciliation is required.",
            expected_states=["SELECT_REQUESTED"],
        )
        if updated is None:
            current = await repository.get_for_user(attempt["selectionId"], user["_id"])
            if current and current["state"] == "SELECTED":
                return _selection_response(current)
        return {"selection_id": attempt["selectionId"], "state": "PENDING", "message": "Provider outcome is still unknown; check selection status before retrying."}
    except (httpx.RequestError, ProtocolError) as error:
        discard(transaction_id, message_id)
        await repository.update_result(selection_id=attempt["selectionId"], user_id=user["_id"], state="SELECT_FAILED", quote=None, error=str(error))
        raise HTTPException(status_code=502, detail="Provider rejected or did not accept selection.") from error

    if callback.get("error"):
        error = callback["error"].get("message", "Provider could not select this offer.")
        await repository.update_result(selection_id=attempt["selectionId"], user_id=user["_id"], state="SELECT_FAILED", quote=None, error=error)
        raise HTTPException(status_code=409, detail=error)
    order = callback["message"]["order"]
    if order.get("provider", {}).get("id") != attempt["item"]["provider_id"]:
        raise HTTPException(status_code=502, detail="Provider callback did not match the selected provider.")
    if not order.get("items") or order["items"][0].get("id") != attempt["item"]["id"]:
        raise HTTPException(status_code=502, detail="Provider callback did not match the selected item.")
    quote = order.get("quote")
    quote_ttl = quote.get("ttl") if isinstance(quote, dict) else None
    quote_expires_at = None
    if isinstance(quote_ttl, str) and quote_ttl.startswith("PT") and quote_ttl.endswith("M"):
        quote_expires_at = datetime.now(timezone.utc) + timedelta(minutes=int(quote_ttl[2:-1]))
    await repository.update_result(
        selection_id=attempt["selectionId"],
        user_id=user["_id"],
        state="SELECTED",
        quote=quote,
        quote_expires_at=quote_expires_at or (datetime.now(timezone.utc) + timedelta(minutes=10)),
    )
    return {"selection_id": attempt["selectionId"], "state": "SELECTED", "quote": quote, "order": order}


@router.get("/selections")
async def list_transport_selections(
    user: dict = Depends(get_current_user),
):
    attempts = await TransportSelectionRepository(get_db()).list_for_user(user["_id"])
    return [_selection_response(attempt) for attempt in attempts]


@router.get("/selections/{selection_id}")
async def get_transport_selection(
    selection_id: str,
    user: dict = Depends(get_current_user),
):
    attempt = await TransportSelectionRepository(get_db()).get_for_user(selection_id, user["_id"])
    if attempt is None:
        raise HTTPException(status_code=404, detail="Selection was not found.")
    return _selection_response(attempt)


@router.post("/selections/{selection_id}/init")
async def init_transport(
    selection_id: str,
    payload: TransportInitRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    require_browser_write(request)
    repository = TransportSelectionRepository(get_db())
    attempt = await repository.get_for_user(selection_id, user["_id"])
    if attempt is None:
        raise HTTPException(status_code=404, detail="Selection was not found.")
    if attempt.get("initState") == "PENDING_PROVIDER":
        return {"selection_id": selection_id, "state": "PENDING", "message": "Provider initialization is still pending; do not retry blindly."}
    if attempt.get("initState") == "INIT_FAILED":
        raise HTTPException(status_code=409, detail=attempt.get("initError") or "Provider could not initialize this order.")
    if attempt.get("state") not in {"SELECTED", "INITIALIZED"}:
        raise HTTPException(status_code=409, detail="The transport selection is not ready to initialize.")
    quote_expires_at = attempt.get("quoteExpiresAt")
    if quote_expires_at is None or _utc_datetime(quote_expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=409, detail="The provider quote has expired. Select the transport again.")
    quantity = attempt["requestedQuantity"]
    if len(payload.travellers) != quantity:
        raise HTTPException(status_code=422, detail="Traveller count must match the selected quantity.")
    details = {
        "travellers": [traveller.model_dump() for traveller in payload.travellers],
        "contact_email": payload.contact_email,
        "contact_phone": payload.contact_phone,
    }
    digest = hashlib.sha256(json.dumps(details, sort_keys=True).encode()).hexdigest()
    if attempt.get("initState") == "INITIALIZED" and attempt.get("initDetails") == details:
        return _selection_response(attempt)
    if attempt.get("initState") == "INITIALIZED":
        if attempt.get("confirmState") not in (None, "CONFIRM_FAILED"):
            raise HTTPException(status_code=409, detail="Customer details cannot be changed after confirmation has started.")
        reset_attempt = await repository.reset_initialized_for_reinit(selection_id, user["_id"])
        if reset_attempt is None:
            raise HTTPException(status_code=409, detail="Customer details cannot be changed while confirmation is in progress.")
        attempt = reset_attempt
    business_key = f"{selection_id}:{digest}"
    message_id = str(uuid.uuid4())
    init_attempt = await repository.begin_init(
        selection_id=selection_id,
        user_id=user["_id"],
        business_key=business_key,
        message_id=message_id,
        traveller_count=quantity,
        details=details,
    )
    if init_attempt is None:
        raise HTTPException(status_code=409, detail="The selection quote expired or initialization is already in progress.")
    claimed = await repository.claim_init_dispatch(selection_id, user["_id"])
    if claimed is None:
        return {"selection_id": selection_id, "state": "PENDING", "message": "Initialization is already being sent to the provider."}
    attempt = claimed
    message = build_transport_init(
        transaction_id=attempt["transactionId"],
        message_id=attempt["initMessageId"],
        provider=attempt["provider"],
        item=attempt["item"],
        quantity=quantity,
        quote=attempt["quote"],
        fulfillment=attempt.get("fulfillment", {}),
        details=details,
        quote_expires_at=_utc_datetime(quote_expires_at).isoformat().replace("+00:00", "Z"),
    )
    validate_message(message, "init")
    callback_future = start(attempt["transactionId"], attempt["initMessageId"])
    try:
        response = await signed_post(request.app.state.http_client, attempt["provider"]["uri"] + "/init", message, request.app.state.beckn_identity)
        require_ack(response)
        callback = await asyncio.wait_for(callback_future, settings.search_timeout_seconds)
    except asyncio.TimeoutError:
        discard(attempt["transactionId"], attempt["initMessageId"])
        await repository.update_init(selection_id=selection_id, user_id=user["_id"], state="PENDING_PROVIDER", error="Provider outcome is unknown.")
        return {"selection_id": selection_id, "state": "PENDING", "message": "Provider initialization is still pending; do not retry blindly."}
    except (httpx.RequestError, ProtocolError) as error:
        discard(attempt["transactionId"], attempt["initMessageId"])
        await repository.update_init(selection_id=selection_id, user_id=user["_id"], state="INIT_FAILED", error=str(error))
        raise HTTPException(status_code=502, detail="Provider rejected initialization.") from error
    if callback.get("error"):
        error = callback["error"].get("message", "Provider could not initialize this order.")
        await repository.update_init(selection_id=selection_id, user_id=user["_id"], state="INIT_FAILED", error=error)
        raise HTTPException(status_code=409, detail=error)
    order = callback.get("message", {}).get("order")
    if not isinstance(order, dict):
        raise HTTPException(status_code=502, detail="Provider returned an invalid initialized order.")
    if order.get("provider", {}).get("id") != attempt["item"]["provider_id"]:
        raise HTTPException(status_code=502, detail="Provider callback did not match the selected provider.")
    callback_items = order.get("items", [])
    callback_quantity = callback_items[0].get("quantity", {}).get("selected", {}).get("count") if callback_items else None
    if not callback_items or callback_items[0].get("id") != attempt["item"]["id"] or callback_quantity != quantity:
        raise HTTPException(status_code=502, detail="Provider callback did not match the selected item or quantity.")
    callback_price = order.get("quote", {}).get("price", {}) if isinstance(order.get("quote"), dict) else {}
    selected_price = attempt["quote"].get("price", {}) if isinstance(attempt.get("quote"), dict) else {}
    price_changed = callback_price != selected_price
    await repository.update_init(
        selection_id=selection_id,
        user_id=user["_id"],
        state="INITIALIZED",
        order=order,
        details=details,
        price_changed=price_changed,
    )
    return {"selection_id": selection_id, "state": "INITIALIZED", "price_changed": price_changed, "order": order}


@router.post("/selections/{selection_id}/confirm")
async def confirm_transport(
    selection_id: str,
    payload: ConfirmRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    require_browser_write(request)
    return await confirm_initialized_order(
        selection_id=selection_id,
        payload=payload,
        request=request,
        user=user,
        kind="transport",
    )


@router.post("/selections/{selection_id}/status")
async def refresh_transport_status(
    selection_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    require_browser_write(request)
    return await refresh_booking_status(
        selection_id=selection_id,
        request=request,
        user=user,
        kind="transport",
    )


@router.post("/selections/{selection_id}/cancel")
async def cancel_transport_booking(
    selection_id: str,
    payload: CancelRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    require_browser_write(request)
    return await cancel_confirmed_order(
        selection_id=selection_id,
        payload=payload,
        request=request,
        user=user,
        kind="transport",
    )
