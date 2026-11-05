import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pymongo.errors import PyMongoError

from app.core.config import settings
from app.core.database import get_db
from app.core.security import require_browser_write
from app.dependencies.auth import get_current_user
from app.repositories.itineraries import ItineraryRepository
from app.repositories.transport_snapshots import (
    SnapshotExpiredError,
    SnapshotNotFoundError,
    TransportSnapshotRepository,
)
from app.schemas.itineraries import ItineraryResponse, SaveItineraryRequest

router = APIRouter(prefix="/api/itineraries", tags=["itineraries"])
logger = logging.getLogger(__name__)


def serialize(document: dict[str, Any]) -> ItineraryResponse:
    def iso(value: Any) -> str:
        return value.isoformat() if isinstance(value, datetime) else ""

    return ItineraryResponse(
        id=str(document["itineraryId"]),
        transport=document["transport"],
        query=document["query"],
        price_status=str(document.get("priceStatus", "saved_estimate")),
        created_at=iso(document.get("createdAt")),
        updated_at=iso(document.get("updatedAt")),
    )


@router.post("", response_model=ItineraryResponse, status_code=status.HTTP_201_CREATED)
async def save_itinerary(
    payload: SaveItineraryRequest,
    request: Request,
    user: dict = Depends(get_current_user),
) -> ItineraryResponse:
    require_browser_write(request)
    try:
        snapshot = await TransportSnapshotRepository(
            get_db(),
            settings.transport_snapshot_ttl_seconds,
        ).get(transaction_id=payload.transaction_id, offer_id=payload.offer_id)
    except (SnapshotExpiredError, SnapshotNotFoundError) as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This transport offer is no longer available. Please search again.",
        ) from error
    except PyMongoError as error:
        logger.exception("itinerary source lookup failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Itinerary could not be saved right now. Please try again.",
        ) from error

    try:
        document = await ItineraryRepository(get_db()).save_or_get(
            user_id=user["_id"],
            transaction_id=payload.transaction_id,
            offer_id=payload.offer_id,
            offer=snapshot["offer"],
            query=snapshot["query"],
        )
    except PyMongoError as error:
        logger.exception("itinerary persistence failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Itinerary could not be saved right now. Please try again.",
        ) from error
    return serialize(document)


@router.get("", response_model=list[ItineraryResponse])
async def list_itineraries(
    user: dict = Depends(get_current_user),
) -> list[ItineraryResponse]:
    try:
        documents = await ItineraryRepository(get_db()).list_for_user(user_id=user["_id"])
    except PyMongoError as error:
        logger.exception("itinerary list failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Saved itineraries are temporarily unavailable.",
        ) from error
    return [serialize(document) for document in documents]


@router.get("/{itinerary_id}", response_model=ItineraryResponse)
async def get_itinerary(
    itinerary_id: str,
    user: dict = Depends(get_current_user),
) -> ItineraryResponse:
    try:
        document = await ItineraryRepository(get_db()).get_for_user(
            user_id=user["_id"],
            itinerary_id=itinerary_id,
        )
    except PyMongoError as error:
        logger.exception("itinerary lookup failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Saved itinerary is temporarily unavailable.",
        ) from error
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved itinerary was not found.",
        )
    return serialize(document)
