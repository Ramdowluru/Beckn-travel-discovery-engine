import asyncio
import json
import logging
import time
from pathlib import Path

import httpx
from contextlib import asynccontextmanager
from fastapi import BackgroundTasks, FastAPI

logging.basicConfig(level=logging.INFO)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http_client = httpx.AsyncClient(timeout=1, trust_env=False)
    yield
    await app.state.http_client.aclose()


app = FastAPI(title="Mock Beckn Gateway", lifespan=lifespan)

PROVIDERS = json.loads((Path(__file__).parent / "providers.json").read_text())


# detect_category is the routing. Since we removed intent.category, the gateway looks at the shape of the message: START and END stops mean transport. <= is a set check for "both of these are present". Anything unrecognised gets a NACK, which is Beckn's "I can't handle this".
# payload: dict accepts any JSON. The gateway shouldn't reject a message just because it doesn't know every field.
# BackgroundTasks runs work after the response has been sent. That's how the gateway ACKs immediately and forwards afterwards, as real Beckn gateways do.
# asyncio.gather sends to all providers at the same time, not one after another. If it were sequential, a slow provider would delay the others, and our 3-second window would suffer.
# The try/except means a provider that's down only prints a message. It never breaks the gateway or the other providers.



def detect_category(payload: dict) -> str | None:
    intent = payload.get("message", {}).get("intent", {})
    stops = intent.get("fulfillment", {}).get("stops", [])
    stop_types = {stop.get("type") for stop in stops}
    if {"START", "END"} <= stop_types:
        return "transport"
    return None


async def forward(provider: dict, payload: dict, client: httpx.AsyncClient) -> None:
    url = f"{provider['bpp_uri']}/search"
    transaction_id = payload.get("context", {}).get("transaction_id")
    started_at = time.monotonic()
    try:
        response = await client.post(url, json=payload)
        logger.info(
            "provider ACK transaction_id=%s provider=%s status=%s body=%s elapsed_ms=%.1f",
            transaction_id,
            provider["bpp_id"],
            response.status_code,
            response.text,
            (time.monotonic() - started_at) * 1000,
        )
    except httpx.RequestError as error:
        logger.warning(
            "provider request failed transaction_id=%s provider=%s error=%s elapsed_ms=%.1f",
            transaction_id,
            provider["bpp_id"],
            error,
            (time.monotonic() - started_at) * 1000,
        )

async def forward_all(providers:list[dict],payload:dict, client: httpx.AsyncClient)->None:
    results = await asyncio.gather(
        *(forward(provider, payload, client) for provider in providers),
        return_exceptions=True,
    )
    for provider, result in zip(providers, results):
        if isinstance(result, Exception):
            logger.error(
                "provider fan-out failed transaction_id=%s provider=%s error=%s",
                payload.get("context", {}).get("transaction_id"),
                provider["bpp_id"],
                result,
            )


@app.post("/search")
async def search(payload: dict, background_tasks: BackgroundTasks):
    started_at = time.monotonic()
    transaction_id = payload.get("context", {}).get("transaction_id")
    category = detect_category(payload)
    if category is None:
        body = {"message":{"ack":{"status":"NACK"}}}
        logger.info("gateway NACK transaction_id=%s body=%s", transaction_id, body)
        return body

    targets = [p for p in PROVIDERS if p["category"]==category]
    background_tasks.add_task(forward_all, targets, payload, app.state.http_client)
    body = {"message":{"ack":{"status":"ACK"}}}
    logger.info(
        "gateway ACK transaction_id=%s targets=%s body=%s elapsed_ms=%.1f",
        transaction_id,
        len(targets),
        body,
        (time.monotonic() - started_at) * 1000,
    )
    return body



#in future

# BAP  →  Gateway  →  Provider A  →  MongoDB account 1
#                  →  Provider B  →  MongoDB account 2
#                  →  Provider C  →  MongoDB account 3