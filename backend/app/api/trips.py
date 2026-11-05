from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pymongo.errors import PyMongoError
from pymongo.asynchronous.database import AsyncDatabase

from app.api.bookings import serialize_booking
from app.core.database import get_db
from app.core.security import require_browser_write
from app.dependencies.auth import get_current_user
from app.repositories.transport_selections import TransportSelectionRepository
from app.repositories.trips import TripRepository
from app.schemas.trips import TripCreateRequest, TripResponse, TripUpdateRequest

router = APIRouter(prefix="/api/trips", tags=["trips"])
logger = logging.getLogger(__name__)


def _iso(value: Any) -> str:
    return value.isoformat() if isinstance(value, (date, datetime)) else ""


def _trip_response(
    document: dict[str, Any],
    bookings: dict[str, dict[str, Any]],
) -> TripResponse:
    references = []
    for booking_id in document.get("bookingIds", []):
        booking = bookings.get(booking_id)
        references.append({
            "booking_id": booking_id,
            "status": booking["status"] if booking else "UNAVAILABLE",
            "booking": booking,
        })
    return TripResponse(
        id=document["tripId"],
        title=document["title"],
        destination=document["destination"],
        start_date=str(document["startDate"]),
        end_date=str(document["endDate"]),
        bookings=references,
        created_at=_iso(document.get("createdAt")),
        updated_at=_iso(document.get("updatedAt")),
    )


async def _hydrate_trip(
    database: AsyncDatabase,
    document: dict[str, Any],
    user_id: ObjectId,
) -> TripResponse:
    booking_ids = list(dict.fromkeys(document.get("bookingIds", [])))
    attempts = await TransportSelectionRepository(database).get_many_for_user(
        user_id=user_id,
        selection_ids=booking_ids,
    )
    serialized = {
        attempt["selectionId"]: serialize_booking(attempt)
        for attempt in attempts
        if attempt.get("initState")
    }
    return _trip_response(document, serialized)


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip was not found.")


def _database_unavailable(operation: str) -> HTTPException:
    logger.exception("trip %s failed", operation)
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Trip data is temporarily unavailable.",
    )


@router.post("", response_model=TripResponse, status_code=status.HTTP_201_CREATED)
async def create_trip(
    payload: TripCreateRequest,
    request: Request,
    user: dict[str, Any] = Depends(get_current_user),
) -> TripResponse:
    require_browser_write(request)
    database = get_db()
    try:
        document = await TripRepository(database).create(
            user_id=user["_id"],
            title=payload.title,
            destination=payload.destination,
            start_date=payload.start_date,
            end_date=payload.end_date,
        )
        return await _hydrate_trip(database, document, user["_id"])
    except PyMongoError as error:
        raise _database_unavailable("creation") from error


@router.get("", response_model=list[TripResponse])
async def list_trips(
    user: dict[str, Any] = Depends(get_current_user),
) -> list[TripResponse]:
    database = get_db()
    try:
        documents = await TripRepository(database).list_for_user(user["_id"])
        return [
            await _hydrate_trip(database, document, user["_id"])
            for document in documents
        ]
    except PyMongoError as error:
        raise _database_unavailable("list") from error


@router.get("/{trip_id}", response_model=TripResponse)
async def get_trip(
    trip_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> TripResponse:
    database = get_db()
    try:
        document = await TripRepository(database).get_for_user(user["_id"], trip_id)
        if document is None:
            raise _not_found()
        return await _hydrate_trip(database, document, user["_id"])
    except PyMongoError as error:
        raise _database_unavailable("lookup") from error


@router.patch("/{trip_id}", response_model=TripResponse)
async def update_trip(
    trip_id: str,
    payload: TripUpdateRequest,
    request: Request,
    user: dict[str, Any] = Depends(get_current_user),
) -> TripResponse:
    require_browser_write(request)
    database = get_db()
    try:
        repository = TripRepository(database)
        current = await repository.get_for_user(user["_id"], trip_id)
        if current is None:
            raise _not_found()
        changes = payload.model_dump(exclude_unset=True)
        start_date = changes.get("start_date", date.fromisoformat(current["startDate"]))
        end_date = changes.get("end_date", date.fromisoformat(current["endDate"]))
        if end_date < start_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="end_date must be on or after start_date.",
            )
        updated = await repository.update_for_user(user["_id"], trip_id, changes)
        if updated is None:
            if await repository.get_for_user(user["_id"], trip_id) is None:
                raise _not_found()
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Trip dates changed concurrently. Refresh and retry.",
            )
        return await _hydrate_trip(database, updated, user["_id"])
    except PyMongoError as error:
        raise _database_unavailable("update") from error


@router.put("/{trip_id}/bookings/{booking_id}", response_model=TripResponse)
async def add_booking_to_trip(
    trip_id: str,
    booking_id: str,
    request: Request,
    user: dict[str, Any] = Depends(get_current_user),
) -> TripResponse:
    require_browser_write(request)
    database = get_db()
    try:
        trip_repository = TripRepository(database)
        if await trip_repository.get_for_user(user["_id"], trip_id) is None:
            raise _not_found()
        attempt = await TransportSelectionRepository(database).get_for_user(booking_id, user["_id"])
        if attempt is None or not attempt.get("initState"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking was not found.")
        document = await trip_repository.add_booking_reference(user["_id"], trip_id, booking_id)
        if document is None:
            raise _not_found()
        return await _hydrate_trip(database, document, user["_id"])
    except PyMongoError as error:
        raise _database_unavailable("booking addition") from error


@router.delete("/{trip_id}/bookings/{booking_id}", response_model=TripResponse)
async def remove_booking_from_trip(
    trip_id: str,
    booking_id: str,
    request: Request,
    user: dict[str, Any] = Depends(get_current_user),
) -> TripResponse:
    require_browser_write(request)
    database = get_db()
    try:
        document = await TripRepository(database).remove_booking_reference(
            user["_id"], trip_id, booking_id
        )
        if document is None:
            raise _not_found()
        return await _hydrate_trip(database, document, user["_id"])
    except PyMongoError as error:
        raise _database_unavailable("booking removal") from error
