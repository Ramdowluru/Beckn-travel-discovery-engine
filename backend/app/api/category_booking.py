import asyncio
import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pymongo.errors import PyMongoError

from app.core.config import settings
from app.core.database import get_db
from app.core.security import require_browser_write
from app.dependencies.auth import get_current_user
from app.repositories.transport_selections import TransportSelectionRepository
from app.repositories.transport_snapshots import (
    SnapshotExpiredError,
    SnapshotNotFoundError,
    TransportSnapshotRepository,
)
from app.schemas.confirmations import CancelRequest, ConfirmRequest
from app.schemas.category_bookings import CategoryInitRequest, CategorySelectRequest
from app.services.booking_cancellation import CANCELLATION_POLICY, cancel_confirmed_order
from app.services.category_order_builder import build_category_init, build_category_select
from app.services.confirmation import confirm_initialized_order
from app.services.booking_status import refresh_booking_status
from app.services.selection_session import discard, start
from protocol.contracts import ProtocolError, require_ack, validate_message
from protocol.signing import signed_post

router = APIRouter(prefix="/api", tags=["category-booking"])
logger = logging.getLogger(__name__)


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _count(kind: str, query: dict[str, Any]) -> int:
    return int(query["rooms"] if kind == "hotel" else query["participants"])


def _selection_response(attempt: dict[str, Any]) -> dict[str, Any]:
    return {
        "selection_id": attempt["selectionId"],
        "state": attempt["state"],
        "kind": attempt.get("kind"),
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


async def _snapshot(kind: str, offer_id: str, transaction_id: str) -> dict[str, Any]:
    try:
        result = await TransportSnapshotRepository(
            get_db(), settings.transport_snapshot_ttl_seconds
        ).get(transaction_id=transaction_id, offer_id=offer_id)
    except (SnapshotExpiredError, SnapshotNotFoundError) as error:
        raise HTTPException(status_code=404, detail="This offer has expired. Search again.") from error
    except PyMongoError as error:
        logger.exception("category snapshot lookup failed kind=%s", kind)
        raise HTTPException(status_code=503, detail="Offer details are temporarily unavailable.") from error
    protocol = result["offer"].get("_beckn")
    if not isinstance(protocol, dict) or protocol.get("kind") != kind:
        raise HTTPException(status_code=404, detail="This offer is not available in the selected category.")
    return result


@router.get("/stays/{offer_id}")
async def get_hotel_offer(offer_id: str, transaction_id: str = Query(min_length=1)):
    snapshot = await _snapshot("hotel", offer_id, transaction_id)
    return {**snapshot["offer"], "query": snapshot["query"], "transaction_id": transaction_id}


@router.get("/experiences/{offer_id}")
async def get_experience_offer(offer_id: str, transaction_id: str = Query(min_length=1)):
    snapshot = await _snapshot("experience", offer_id, transaction_id)
    return {**snapshot["offer"], "query": snapshot["query"], "transaction_id": transaction_id}


@router.post("/{kind}/{offer_id}/select")
async def select_category_offer(
    kind: str,
    offer_id: str,
    payload: CategorySelectRequest,
    request: Request,
    transaction_id: str = Query(min_length=1),
    user: dict = Depends(get_current_user),
):
    if kind not in {"stays", "experiences"}:
        raise HTTPException(status_code=404, detail="Category is not supported.")
    require_browser_write(request)
    category = "hotel" if kind == "stays" else "experience"
    snapshot = await _snapshot(category, offer_id, transaction_id)
    protocol = snapshot["offer"]["_beckn"]
    query = snapshot["query"]
    quantity = _count(category, query)
    if payload.quantity != quantity:
        raise HTTPException(status_code=422, detail="Quantity must match the selected search criteria.")
    available = protocol.get("available_rooms" if category == "hotel" else "available_participants")
    if not isinstance(available, int) or available < quantity:
        raise HTTPException(status_code=409, detail="The requested quantity is no longer available.")
    try:
        trusted_uri = request.app.state.beckn_identity.address(protocol["bpp_id"])
        request.app.state.beckn_identity.check_address(protocol["bpp_id"], protocol["bpp_uri"])
    except (ProtocolError, KeyError) as error:
        raise HTTPException(status_code=502, detail="The provider identity is not trusted.") from error

    criteria = {
        **query,
        "kind": category,
        "room_capacity": protocol.get("room_capacity", 0),
        "fulfillment_id": protocol.get("fulfillment_id"),
    }
    business_key = f"{transaction_id}:{category}:{offer_id}:{quantity}"
    repository = TransportSelectionRepository(get_db())
    attempt = await repository.create_or_get(
        user_id=user["_id"],
        business_key=business_key,
        transaction_id=transaction_id,
        snapshot={
            "provider": {"id": protocol["bpp_id"], "uri": trusted_uri},
            "item": {"id": protocol["item_id"], "provider_id": protocol["provider_id"]},
            "fulfillment": protocol["fulfillment"],
            "price": protocol["price"],
        },
        quantity=quantity,
        message_id=str(uuid.uuid4()),
        kind=category,
        criteria=criteria,
        display={key: value for key, value in snapshot["offer"].items() if key != "_beckn"},
    )
    if attempt["state"] == "SELECTED":
        return _selection_response(attempt)
    if attempt["state"] == "PENDING_PROVIDER":
        return {**_selection_response(attempt), "state": "PENDING"}
    if attempt["state"] != "SELECT_REQUESTED":
        raise HTTPException(status_code=409, detail="This offer selection has already failed.")
    claimed = await repository.claim_dispatch(attempt["selectionId"], user["_id"])
    if claimed is None:
        return {"selection_id": attempt["selectionId"], "state": "PENDING"}
    attempt = claimed
    message = build_category_select(
        kind=category,
        transaction_id=transaction_id,
        message_id=attempt["messageId"],
        provider=attempt["provider"],
        item=attempt["item"],
        fulfillment=attempt["fulfillment"],
        quantity=quantity,
        criteria=criteria,
    )
    validate_message(message, "select")
    callback_future = start(transaction_id, attempt["messageId"])
    try:
        response = await signed_post(
            request.app.state.http_client,
            trusted_uri + "/select",
            message,
            request.app.state.beckn_identity,
        )
        require_ack(response)
        callback = await asyncio.wait_for(callback_future, settings.search_timeout_seconds)
    except asyncio.TimeoutError:
        discard(transaction_id, attempt["messageId"])
        await repository.update_result(
            selection_id=attempt["selectionId"],
            user_id=user["_id"],
            state="PENDING_PROVIDER",
            quote=None,
            error="Provider outcome is unknown.",
            expected_states=["SELECT_REQUESTED"],
        )
        return {"selection_id": attempt["selectionId"], "state": "PENDING"}
    except (httpx.RequestError, ProtocolError) as error:
        discard(transaction_id, attempt["messageId"])
        await repository.update_result(
            selection_id=attempt["selectionId"],
            user_id=user["_id"],
            state="SELECT_FAILED",
            quote=None,
            error=type(error).__name__,
            expected_states=["SELECT_REQUESTED"],
        )
        raise HTTPException(status_code=502, detail="Provider did not accept the selection.") from error
    if callback.get("error"):
        raise HTTPException(status_code=409, detail=callback["error"].get("message", "Provider selection failed."))
    current = await repository.get_for_user(attempt["selectionId"], user["_id"])
    if current is None or current["state"] != "SELECTED":
        raise HTTPException(status_code=502, detail="Provider selection callback was not persisted.")
    return _selection_response(current)


@router.get("/category-selections/{selection_id}")
async def get_category_selection(
    selection_id: str,
    user: dict = Depends(get_current_user),
):
    attempt = await TransportSelectionRepository(get_db()).get_for_user(selection_id, user["_id"])
    if attempt is None or attempt.get("kind") not in {"hotel", "experience"}:
        raise HTTPException(status_code=404, detail="Selection was not found.")
    return _selection_response(attempt)


@router.post("/category-selections/{selection_id}/init")
async def init_category_offer(
    selection_id: str,
    payload: CategoryInitRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    require_browser_write(request)
    repository = TransportSelectionRepository(get_db())
    attempt = await repository.get_for_user(selection_id, user["_id"])
    if attempt is None or attempt.get("kind") not in {"hotel", "experience"}:
        raise HTTPException(status_code=404, detail="Selection was not found.")
    if attempt.get("initState") in {"INIT_REQUESTED", "PENDING_PROVIDER"}:
        return {"selection_id": selection_id, "state": "PENDING"}
    if attempt.get("initState") == "INIT_FAILED":
        raise HTTPException(status_code=409, detail=attempt.get("initError") or "Provider could not initialize this order.")
    if attempt["state"] not in {"SELECTED", "INITIALIZED"}:
        raise HTTPException(status_code=409, detail="The selected quote is not ready to initialize.")
    expiry = attempt.get("quoteExpiresAt")
    if not isinstance(expiry, datetime) or _utc(expiry) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=409, detail="The selected provider quote has expired.")

    kind = attempt["kind"]
    criteria = attempt["criteria"]
    expected_count = int(criteria["guests"] if kind == "hotel" else criteria["participants"])
    if len(payload.people) != expected_count:
        raise HTTPException(status_code=422, detail="Guest or participant count must match the selected offer.")
    assignments = payload.room_assignments
    if kind == "hotel":
        capacity = int(attempt["criteria"].get("room_capacity", 0) or attempt.get("roomCapacity", 0) or 0)
        rooms = int(criteria["rooms"])
        if assignments is None or len(assignments) != expected_count:
            raise HTTPException(status_code=422, detail="Assign every guest to a selected room.")
        if any(room < 1 or room > rooms for room in assignments):
            raise HTTPException(status_code=422, detail="Guest room assignment is outside the selected room range.")
        if any(assignments.count(room) > capacity for room in range(1, rooms + 1)):
            raise HTTPException(status_code=422, detail="Room allocation exceeds the selected room capacity.")
    elif assignments is not None:
        raise HTTPException(status_code=422, detail="Room assignments apply to hotel stays only.")

    details = {
        "people": [person.model_dump(exclude_none=True) for person in payload.people],
        "room_assignments": assignments or [],
        "contact_email": str(payload.contact_email),
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
    init_attempt = await repository.begin_init(
        selection_id=selection_id,
        user_id=user["_id"],
        business_key=f"{selection_id}:{digest}",
        message_id=str(uuid.uuid4()),
        traveller_count=expected_count,
        details=details,
    )
    if init_attempt is None:
        raise HTTPException(status_code=409, detail="The quote expired or initialization is already in progress.")
    claimed = await repository.claim_init_dispatch(selection_id, user["_id"])
    if claimed is None:
        return {"selection_id": selection_id, "state": "PENDING"}
    attempt = claimed
    message = build_category_init(
        kind=kind,
        transaction_id=attempt["transactionId"],
        message_id=attempt["initMessageId"],
        provider=attempt["provider"],
        item=attempt["item"],
        fulfillment=attempt["fulfillment"],
        quantity=attempt["requestedQuantity"],
        quote=attempt["quote"],
        quote_expires_at=_utc(expiry).isoformat().replace("+00:00", "Z"),
        details=details,
        criteria=criteria,
    )
    validate_message(message, "init")
    callback_future = start(attempt["transactionId"], attempt["initMessageId"])
    try:
        response = await signed_post(
            request.app.state.http_client,
            attempt["provider"]["uri"] + "/init",
            message,
            request.app.state.beckn_identity,
        )
        require_ack(response)
        callback = await asyncio.wait_for(callback_future, settings.search_timeout_seconds)
    except asyncio.TimeoutError:
        discard(attempt["transactionId"], attempt["initMessageId"])
        await repository.update_init(
            selection_id=selection_id,
            user_id=user["_id"],
            state="PENDING_PROVIDER",
            error="Provider outcome is unknown.",
            expected_states=["INIT_REQUESTED"],
        )
        return {"selection_id": selection_id, "state": "PENDING"}
    except (httpx.RequestError, ProtocolError) as error:
        discard(attempt["transactionId"], attempt["initMessageId"])
        await repository.update_init(
            selection_id=selection_id,
            user_id=user["_id"],
            state="INIT_FAILED",
            error=type(error).__name__,
            expected_states=["INIT_REQUESTED"],
        )
        raise HTTPException(status_code=502, detail="Provider did not accept initialization.") from error
    if callback.get("error"):
        raise HTTPException(status_code=409, detail=callback["error"].get("message", "Provider initialization failed."))
    current = await repository.get_for_user(selection_id, user["_id"])
    if current is None or current.get("initState") != "INITIALIZED":
        raise HTTPException(status_code=502, detail="Provider initialization callback was not persisted.")
    return _selection_response(current)


@router.post("/category-selections/{selection_id}/confirm")
async def confirm_category_offer(
    selection_id: str,
    payload: ConfirmRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    require_browser_write(request)
    attempt = await TransportSelectionRepository(get_db()).get_for_user(selection_id, user["_id"])
    if attempt is None or attempt.get("kind") not in {"hotel", "experience"}:
        raise HTTPException(status_code=404, detail="Initialized booking was not found.")
    return await confirm_initialized_order(
        selection_id=selection_id,
        payload=payload,
        request=request,
        user=user,
        kind=attempt["kind"],
    )


@router.post("/category-selections/{selection_id}/status")
async def refresh_category_status(
    selection_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    require_browser_write(request)
    attempt = await TransportSelectionRepository(get_db()).get_for_user(selection_id, user["_id"])
    if attempt is None or attempt.get("kind") not in {"hotel", "experience"}:
        raise HTTPException(status_code=404, detail="Booking was not found.")
    return await refresh_booking_status(
        selection_id=selection_id,
        request=request,
        user=user,
        kind=attempt["kind"],
    )


@router.post("/category-selections/{selection_id}/cancel")
async def cancel_category_booking(
    selection_id: str,
    payload: CancelRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    require_browser_write(request)
    attempt = await TransportSelectionRepository(get_db()).get_for_user(selection_id, user["_id"])
    if attempt is None or attempt.get("kind") not in {"hotel", "experience"}:
        raise HTTPException(status_code=404, detail="Confirmed booking was not found.")
    return await cancel_confirmed_order(
        selection_id=selection_id,
        payload=payload,
        request=request,
        user=user,
        kind=attempt["kind"],
    )
