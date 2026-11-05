from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pymongo.errors import PyMongoError

from app.core.database import get_db
from app.dependencies.auth import get_current_user
from app.repositories.transport_selections import TransportSelectionRepository
from app.services.booking_cancellation import CANCELLATION_POLICY

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


def _provider_order(attempt: dict[str, Any]) -> dict[str, Any]:
    for snapshot_key in ("cancelledProviderResponse", "confirmedProviderResponse"):
        response = attempt.get(snapshot_key)
        order = response.get("message", {}).get("order") if isinstance(response, dict) else None
        if isinstance(order, dict):
            return order
    order = attempt.get("providerOrder")
    return order if isinstance(order, dict) else {}


def _booking_status(attempt: dict[str, Any]) -> str:
    if attempt.get("cancelState") == "CANCELLED":
        return "CANCELLED"
    if attempt.get("cancelState") in {"CANCEL_REQUESTED", "PENDING_PROVIDER"}:
        return "PENDING_UNKNOWN"
    if attempt.get("confirmState") == "CONFIRMED":
        return "CONFIRMED"
    if attempt.get("confirmState") == "CONFIRM_FAILED" or attempt.get("initState") == "INIT_FAILED":
        return "REJECTED"
    if (
        attempt.get("state") == "PENDING_PROVIDER"
        or attempt.get("initState") in {"INIT_REQUESTED", "PENDING_PROVIDER"}
        or attempt.get("confirmState") in {"CONFIRM_REQUESTED", "PENDING_PROVIDER"}
        or attempt.get("cancelState") in {"CANCEL_REQUESTED", "PENDING_PROVIDER"}
    ):
        return "PENDING_UNKNOWN"
    if attempt.get("initState") == "INITIALIZED" or attempt.get("state") == "INITIALIZED":
        return "INITIALIZED"
    return "PENDING_UNKNOWN"


def serialize_booking(attempt: dict[str, Any]) -> dict[str, Any]:
    order = _provider_order(attempt)
    items = order.get("items") or []
    item = items[0] if items and isinstance(items[0], dict) else {}
    display = dict(attempt.get("bookingDisplay") or {})
    criteria = attempt.get("criteria") or {}
    if attempt.get("kind") == "transport":
        display.setdefault("departureCity", criteria.get("from"))
        display.setdefault("arrivalCity", criteria.get("to"))
        display.setdefault("date", criteria.get("date"))
        fulfillment = (order.get("fulfillments") or [{}])[0]
        for edge, date_key, time_key in (
            ("start", "departureDate", "departure"),
            ("end", "arrivalDate", "arrival"),
        ):
            point = fulfillment.get(edge) if isinstance(fulfillment, dict) else None
            time = point.get("time") if isinstance(point, dict) else None
            timestamp = time.get("timestamp") if isinstance(time, dict) else None
            if not isinstance(timestamp, str):
                continue
            try:
                parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    continue
                local_time = parsed.astimezone(timezone(timedelta(hours=5, minutes=30)))
            except ValueError:
                continue
            display[date_key] = local_time.strftime("%Y-%m-%d")
            display[time_key] = local_time.strftime("%H:%M")
    elif attempt.get("kind") == "hotel":
        display.setdefault("location", criteria.get("to"))
        display.setdefault("checkIn", criteria.get("check_in"))
        display.setdefault("checkOut", criteria.get("check_out"))
    elif attempt.get("kind") == "experience":
        display.setdefault("location", criteria.get("to") or criteria.get("destination"))
        display.setdefault("date", criteria.get("experience_date"))
    if not display.get("location"):
        display["location"] = criteria.get("to") or criteria.get("destination")
    provider = attempt.get("provider") or {}
    provider_order = attempt.get("providerOrder") or {}
    order_provider = order.get("provider")
    order_provider = order_provider if isinstance(order_provider, dict) else {}
    return {
        "id": attempt["selectionId"],
        "kind": attempt.get("kind", "transport"),
        "status": _booking_status(attempt),
        "selection_state": attempt.get("state"),
        "init_state": attempt.get("initState"),
        "confirm_state": attempt.get("confirmState"),
        "cancel_state": attempt.get("cancelState"),
        "transaction_id": attempt.get("transactionId"),
        "provider_id": provider.get("id"),
        "provider_name": display.get("provider") or order_provider.get("descriptor", {}).get("name"),
        "provider_order_id": provider_order.get("id") or order.get("id"),
        "service": display.get("name") or item.get("descriptor", {}).get("name") or item.get("id"),
        "display": display,
        "criteria": criteria,
        "quantity": attempt.get("requestedQuantity"),
        "quote": order.get("quote") or attempt.get("quote"),
        "customer_details": attempt.get("initDetails") or {},
        "order": order,
        "confirmed_response": attempt.get("confirmedProviderResponse"),
        "cancelled_response": attempt.get("cancelledProviderResponse"),
        "cancellation_policy": CANCELLATION_POLICY,
    }


async def _owned_attempt(booking_id: str, user: dict[str, Any]) -> dict[str, Any]:
    try:
        attempt = await TransportSelectionRepository(get_db()).get_for_user(booking_id, user["_id"])
    except PyMongoError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Booking records are temporarily unavailable.",
        ) from error
    if attempt is None or not attempt.get("initState"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking was not found.")
    return attempt


@router.get("")
async def list_bookings(user: dict[str, Any] = Depends(get_current_user)) -> list[dict[str, Any]]:
    try:
        attempts = await TransportSelectionRepository(get_db()).list_for_user(user["_id"], limit=100)
    except PyMongoError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Booking records are temporarily unavailable.",
        ) from error
    return [serialize_booking(attempt) for attempt in attempts if attempt.get("initState") and not attempt.get("hidden")]


@router.get("/{booking_id}")
async def get_booking(
    booking_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    return serialize_booking(await _owned_attempt(booking_id, user))


@router.get("/{booking_id}/ticket")
async def download_mock_ticket(
    booking_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> Response:
    attempt = await _owned_attempt(booking_id, user)
    is_stay = attempt.get("kind") == "hotel"
    is_experience = attempt.get("kind") == "experience"
    document_label = "voucher" if is_stay or is_experience else "ticket"
    if (
        attempt.get("confirmState") != "CONFIRMED"
        or attempt.get("cancelState") in {"CANCELLED", "CANCEL_REQUESTED", "PENDING_PROVIDER"}
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A mock {document_label} is available only for a currently confirmed booking.",
        )

    booking = serialize_booking(attempt)
    details = booking["customer_details"]
    if booking["kind"] == "transport":
        people = details.get("travellers", [])
    else:
        people = details.get("people", [])
    names = [person.get("name", "") for person in people if isinstance(person, dict)]
    rooms = details.get("room_assignments", [])
    quote = booking.get("quote") or {}
    price = quote.get("price") or {}
    display = booking["display"]
    lines = [
        "Academic prototype — simulated stay voucher; not a real reservation."
        if is_stay else
        "Academic prototype — simulated experience voucher; not a real activity booking."
        if is_experience else "Academic prototype — not valid for travel.",
        f"Provider reference: {booking.get('provider_order_id') or 'not supplied'}",
        f"Provider: {booking.get('provider_name') or booking.get('provider_id') or 'Mock provider'}",
        f"Service: {booking.get('service') or 'Provider service'}",
        f"Status: {booking['status']}",
        f"{'Rooms' if is_stay else 'Participants' if is_experience else 'Quantity'}: {booking.get('quantity') or 0}",
        f"Final price: {price.get('currency', '')} {price.get('value', '')}".strip(),
        f"{'Guests' if is_stay else 'Participants' if is_experience else 'Customers'}: {', '.join(f'{name} (Room {rooms[index]})' if is_stay and index < len(rooms) else name for index, name in enumerate(names))}",
        f"Email: {details.get('contact_email', '')}",
        f"Phone: {details.get('contact_phone', '')}",
    ]
    for label, key in (
        ("Location", "location"),
        ("Route", "route"),
        ("Check-in", "checkIn"),
        ("Check-out", "checkOut"),
        ("Date", "date"),
        ("Departure date", "departureDate"),
        ("Departure (IST)" if booking["kind"] == "transport" else "Departure", "departure"),
        ("Arrival date", "arrivalDate"),
        ("Arrival (IST)" if booking["kind"] == "transport" else "Arrival", "arrival"),
    ):
        value = display.get(key)
        if value:
            lines.append(f"{label}: {value}")
    return Response(
        content="\r\n".join(lines) + "\r\n",
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="mock-{document_label}-{booking_id}.txt"'},
    )


@router.delete("/{booking_id}")
async def hide_booking(
    booking_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, str]:
    """Hide a cancelled booking from My Bookings (soft delete)."""
    try:
        attempt = await TransportSelectionRepository(get_db()).hide_booking(booking_id, user["_id"])
    except PyMongoError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Booking records are temporarily unavailable.",
        ) from error
    
    if attempt is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found or is not cancelled.",
        )
    
    return {"message": "Booking removed from My Bookings"}
