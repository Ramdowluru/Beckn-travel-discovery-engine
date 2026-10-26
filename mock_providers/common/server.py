import asyncio
import json
import os
import random
import logging
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from contextlib import asynccontextmanager

from common.beckn_converter import build_on_search

logging.basicConfig(level=logging.INFO)

def create_app(provider_dir: Path) -> FastAPI:
    load_dotenv(provider_dir / ".env")
    data = json.loads((provider_dir / "data.json").read_text(encoding="utf-8"))
    name = data["provider"]["name"]
    delay = float(os.getenv("DELAY_SECONDS", "0.5"))
    fail_rate = float(os.getenv("FAIL_RATE", "0"))

    logger = logging.getLogger(name)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.http_client = httpx.AsyncClient(timeout=5, trust_env=False)
        yield
        await app.state.http_client.aclose()

    app = FastAPI(title=name, lifespan=lifespan)

    async def reply(request: dict) -> None:
        await asyncio.sleep(delay)

        if random.random() < fail_rate:
            print(f"[{name}] simulated failure, no reply sent")
            return

        on_search = build_on_search(data, request)
        url = f"{request['context']['bap_uri']}/api/on_search"
        transaction_id = request.get("context", {}).get("transaction_id")
        started_at = time.monotonic()
        try:
            response = await app.state.http_client.post(url, json=on_search)
            logger.info(
                "callback transaction_id=%s status=%s body=%s elapsed_ms=%.1f",
                transaction_id,
                response.status_code,
                response.text,
                (time.monotonic() - started_at) * 1000,
            )
        except httpx.RequestError as error:
            logger.warning(
                "callback failed transaction_id=%s error=%s elapsed_ms=%.1f",
                transaction_id,
                error,
                (time.monotonic() - started_at) * 1000,
            )

    @app.post("/search")
    async def search(request: dict):
        asyncio.create_task(reply(request))
        return {"message":{"ack":{"status":"ACK"}}}

    return app
