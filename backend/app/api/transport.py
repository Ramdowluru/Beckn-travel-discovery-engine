import logging

from fastapi import APIRouter, HTTPException, Query
from pymongo.errors import PyMongoError

from app.core.config import settings
from app.core.database import get_db
from app.repositories.transport_snapshots import (
    SnapshotExpiredError,
    SnapshotNotFoundError,
    TransportSnapshotRepository,
)

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


@router.get("/transport/{offer_id}")
async def get_transport(
    offer_id: str,
    transaction_id: str = Query(min_length=1),
):
    try:
        snapshot = await TransportSnapshotRepository(
            get_db(),
            settings.transport_snapshot_ttl_seconds,
        ).get(transaction_id=transaction_id, offer_id=offer_id)
    except SnapshotExpiredError as error:
        raise HTTPException(
            status_code=404,
            detail="This transport offer has expired. Please search again.",
        ) from error
    except SnapshotNotFoundError as error:
        raise HTTPException(
            status_code=404,
            detail="This transport offer is no longer available. Please search again.",
        ) from error
    except PyMongoError as error:
        logger.exception(
            "transport snapshot lookup failed transaction_id=%s offer_id=%s",
            transaction_id,
            offer_id,
        )
        raise HTTPException(
            status_code=503,
            detail="Transport details are temporarily unavailable. Please try again.",
        ) from error

    return {
        **snapshot["offer"],
        "query": snapshot["query"],
        "transaction_id": snapshot["transaction_id"],
    }
