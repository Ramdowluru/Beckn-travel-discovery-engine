import uuid
import logging
import time

import httpx
from fastapi import APIRouter, HTTPException, Query, Request

from app.core.config import settings
from app.schemas.search import SearchQuery
from app.services.beckn_builder import build_transport_search
from app.services.search_session import collect, end_session, start_session
from app.services.transport_normalizer import normalize_transport_callbacks

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


@router.get("/search")
async def search(
    request: Request,
    origin: str = Query(default="", alias="from"),
    destination: str = Query(min_length=1, alias="to"),
    date: str | None = None,
    travellers: int = Query(default=1, ge=1),
    tab: str = "travel",
):
    query = SearchQuery.model_validate({
        "from": origin,
        "to": destination,
        "date": date,
        "travellers": travellers,
        "tab": tab,
    })
    transaction_id = str(uuid.uuid4())
    started_at = time.monotonic()
    logger.info("search start transaction_id=%s", transaction_id)
    messages = []

    if query.origin:
        messages.append(build_transport_search(query, transaction_id))

    start_session(transaction_id)
    try:
        for message in messages:
            response = await request.app.state.http_client.post(
                f"{settings.gateway_url}/search", json=message
            )
            logger.info(
                "gateway ACK transaction_id=%s status=%s body=%s elapsed_ms=%.1f",
                transaction_id,
                response.status_code,
                response.text,
                (time.monotonic() - started_at) * 1000,
            )
    except httpx.RequestError as error:
        logger.error("gateway request failed transaction_id=%s error=%s", transaction_id, error)
        end_session(transaction_id)
        raise HTTPException(status_code=502, detail="Gateway is not reachable.")

    responses = await collect(transaction_id, settings.search_timeout_seconds)
    logger.info(
        "search session removed transaction_id=%s callbacks=%s elapsed_ms=%.1f",
        transaction_id,
        len(responses),
        (time.monotonic() - started_at) * 1000,
    )
    if messages and not responses:
        raise HTTPException(
            status_code=504,
            detail="Search providers did not respond in time. Please retry.",
        )
    transport = normalize_transport_callbacks(responses)

    return {
        "query": {
            "from": query.origin,
            "to": query.destination,
            "date": query.date.isoformat() if query.date else "",
            "travellers": query.travellers,
        },
        "counts": {
            "transport": len(transport),
            "stays": 0,
            "experiences": 0,
        },
        "transport": transport,
        "stays": [],
        "experiences": [],
        "transaction_id": transaction_id,
        "providers_replied": len(responses),
    }