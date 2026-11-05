import uuid
import logging
import time

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import ValidationError
from pymongo.errors import PyMongoError

from app.core.config import settings
from app.core.database import get_db
from app.repositories.transport_snapshots import TransportSnapshotRepository
from app.schemas.search import SearchQuery
from app.services.beckn_builder import build_experience_search, build_hotel_search, build_transport_search
from app.services.search_session import (
    collect,
    end_session,
    expected_provider_ids,
    set_expected_provider_ids,
    start_session,
    summarize_providers,
    valid_callbacks,
)
from app.services.hotel_normalizer import normalize_hotel_callbacks
from app.services.experience_normalizer import normalize_experience_callbacks
from app.services.transport_normalizer import normalize_transport_callbacks
from protocol.contracts import ProtocolError, validate_message, require_ack
from protocol.signing import signed_post
import json

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


@router.get("/search")
async def search(
    request: Request,
    origin: str = Query(default="", alias="from"),
    destination: str = Query(default="", alias="to"),
    date: str | None = None,
    travellers: int = Query(default=1),
    check_in: str | None = None,
    check_out: str | None = None,
    rooms: int | None = None,
    guests: int | None = None,
    experience_date: str | None = None,
    participants: int | None = None,
    tab: str = "travel",
):
    try:
        query = SearchQuery.model_validate({
            "from": origin,
            "to": destination,
            "date": date,
            "travellers": travellers,
            "check_in": check_in,
            "check_out": check_out,
            "rooms": rooms,
            "guests": guests,
            "experience_date": experience_date,
            "participants": participants,
            "tab": tab,
        })
    except ValidationError as error:
        raise HTTPException(
            status_code=422,
            detail=[
                {
                    "loc": list(err.get("loc", ())),
                    "msg": err.get("msg", "").removeprefix("Value error, "),
                    "type": err.get("type", "value_error"),
                }
                for err in error.errors()
            ],
        )

    transaction_id = str(uuid.uuid4())
    is_hotel = query.tab == "stays"
    is_experience = query.tab == "experiences"
    started_at = time.monotonic()
    logger.info("search start transaction_id=%s", transaction_id)
    messages = []

    messages.append(
        build_hotel_search(query, transaction_id)
        if is_hotel
        else build_experience_search(query, transaction_id)
        if is_experience
        else build_transport_search(query, transaction_id)
    )

    for message in messages:
        validate_message(message, "search")
    start_session(transaction_id, messages[0]["context"] if messages else None)
    try:
        for message in messages:
            response = await signed_post(
                request.app.state.http_client, f"{settings.gateway_url}/search", message,
                request.app.state.beckn_identity,
            )
            logger.info(
                "gateway ACK transaction_id=%s status=%s body=%s elapsed_ms=%.1f",
                transaction_id,
                response.status_code,
                response.text,
                (time.monotonic() - started_at) * 1000,
            )
            require_ack(response)
            gateway_provider_ids = json.loads(response.headers.get("X-TDE-Expected-Providers", "[]"))
            if not isinstance(gateway_provider_ids, list) or not gateway_provider_ids:
                raise ProtocolError("Gateway selected no providers")
            # Only configured trusted mock BPPs can be expected callback senders.
            for subscriber in gateway_provider_ids:
                request.app.state.beckn_identity.address(subscriber)
            set_expected_provider_ids(transaction_id, gateway_provider_ids)
    except (ProtocolError, ValueError) as error:
        end_session(transaction_id)
        raise HTTPException(status_code=502, detail="Gateway returned an invalid or rejected protocol response.") from error
    except httpx.RequestError as error:
        logger.error("gateway request failed transaction_id=%s error=%s", transaction_id, error)
        end_session(transaction_id)
        raise HTTPException(status_code=502, detail="Gateway is not reachable.")

    expected_ids = expected_provider_ids(transaction_id)
    responses = await collect(transaction_id, settings.search_timeout_seconds)
    valid_responses = valid_callbacks(responses, expected_ids)
    logger.info(
        "search session removed transaction_id=%s callbacks=%s elapsed_ms=%.1f",
        transaction_id,
        len(responses),
        (time.monotonic() - started_at) * 1000,
    )
    if messages and not valid_responses:
        raise HTTPException(
            status_code=504,
            detail="Search providers did not respond in time. Please retry.",
        )
    transport = [] if is_hotel or is_experience else normalize_transport_callbacks(
        valid_responses, query.travellers, expected_ids,
    )
    stays = normalize_hotel_callbacks(
        valid_responses,
        query.check_in,
        query.check_out,
        query.rooms,
        expected_ids,
    ) if is_hotel else []
    experiences = normalize_experience_callbacks(
        valid_responses,
        query.experience_date,
        query.participants or query.travellers,
        expected_ids,
    ) if is_experience else []
    query_context = {
        "from": query.origin,
        "to": query.destination,
        "date": query.date.isoformat() if query.date else "",
        "travellers": query.travellers,
    }
    hotel_query = {
        "destination": query.destination,
        "check_in": query.check_in.isoformat() if query.check_in else "",
        "check_out": query.check_out.isoformat() if query.check_out else "",
        "rooms": query.rooms or 1,
        "guests": query.guests or query.travellers,
    }
    experience_query = {
        "destination": query.destination,
        "date": (query.experience_date or query.date).isoformat()
        if (query.experience_date or query.date) else "",
        "participants": query.participants or query.travellers,
    }
    try:
        await TransportSnapshotRepository(
            get_db(),
            settings.transport_snapshot_ttl_seconds,
        ).save_many(
            transaction_id=transaction_id,
            query=query_context,
            offers=transport,
        )
        if is_hotel:
            await TransportSnapshotRepository(
                get_db(), settings.transport_snapshot_ttl_seconds
            ).save_many(
                transaction_id=transaction_id,
                query=hotel_query,
                offers=stays,
            )
        if is_experience:
            await TransportSnapshotRepository(
                get_db(), settings.transport_snapshot_ttl_seconds
            ).save_many(
                transaction_id=transaction_id,
                query=experience_query,
                offers=experiences,
            )
    except PyMongoError as error:
        logger.exception(
            "transport snapshot persistence failed transaction_id=%s",
            transaction_id,
        )
        raise HTTPException(
            status_code=503,
            detail="Search results could not be saved. Please retry.",
        ) from error
    provider_summary = summarize_providers(expected_ids, valid_responses)

    return {
        "query": query_context,
        "counts": {
            "transport": len(transport),
            "stays": len(stays),
            "experiences": len(experiences),
        },
        "transport": transport,
        "stays": stays,
        "experiences": experiences,
        "transaction_id": transaction_id,
        "providers_expected": provider_summary.expected,
        "providers_replied": provider_summary.responded,
        "partial_results": provider_summary.partial,
    }
