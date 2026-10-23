import uuid

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.core.config import settings
from app.schemas.search import SearchQuery
from app.services.beckn_builder import build_transport_search
from app.services.search_session import collect, end_session, start_session

router = APIRouter(prefix="/api")


@router.get("/search")
async def search(
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
    messages = []

    if query.origin:
        messages.append(build_transport_search(query, transaction_id))

    start_session(transaction_id)
    try:
        async with httpx.AsyncClient(timeout=5, trust_env=False) as client:
            for message in messages:
                await client.post(f"{settings.gateway_url}/search", json=message)
    except httpx.RequestError:
        end_session(transaction_id)
        raise HTTPException(status_code=502, detail="Gateway is not reachable.")

    responses = await collect(transaction_id, settings.search_timeout_seconds)

    return {
        "transaction_id": transaction_id,
        "providers_replied": len(responses),
        "responses": responses,
    }