import asyncio 
import json
from pathlib import Path

import httpx
from fastapi import FastAPI

app = FastAPI(title="Mock Beckn Gateway")

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


async def forward(provider: dict, payload: dict) -> None:
    url = f"{provider['bpp_uri']}/search"
    try:
        async with httpx.AsyncClient(timeout=1, trust_env=False) as client:
            await client.post(url, json=payload)
    except httpx.RequestError:
        print(f"Could not reach {provider['bpp_id']} at {url}")

async def forward_all(providers:list[dict],payload:dict)->None:
    try:
        await asyncio.wait_for(
            asyncio.gather(*(forward(p, payload) for p in providers)),
            timeout=0.8,
        )
    except asyncio.TimeoutError:
        print("Provider fan-out timed out; continuing with completed callbacks")


@app.post("/search")
async def search(payload: dict):
    category = detect_category(payload)
    if category is None:
        return {"message":{"ack":{"status":"NACK"}}}

    targets = [p for p in PROVIDERS if p["category"]==category]
    await forward_all(targets, payload)
    return {"message":{"ack":{"status":"ACK"}}}



#in future

# BAP  →  Gateway  →  Provider A  →  MongoDB account 1
#                  →  Provider B  →  MongoDB account 2
#                  →  Provider C  →  MongoDB account 3