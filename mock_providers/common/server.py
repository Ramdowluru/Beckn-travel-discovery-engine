import asyncio
import json
import os
import random
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI

from common.beckn_converter import build_on_search

def create_app(provider_dir: Path) -> FastAPI:
    load_dotenv(provider_dir / ".env")
    data = json.loads((provider_dir / "data.json").read_text(encoding="utf-8"))
    name = data["provider"]["name"]
    delay = float(os.getenv("DELAY_SECONDS", "0.5"))
    fail_rate = float(os.getenv("FAIL_RATE", "0"))

    app = FastAPI(title=name)

    async def reply(request: dict) -> None:
        await asyncio.sleep(delay)

        if random.random() < fail_rate:
            print(f"[{name}] simulated failure, no reply sent")
            return

        on_search = build_on_search(data, request)
        url = f"{request['context']['bap_uri']}/api/on_search"
        try:
            async with httpx.AsyncClient(timeout=5, trust_env=False) as client:
                response = await client.post(url, json=on_search)
            print(f"[{name}] replied to {url} -> {response.status_code}")
        except httpx.RequestError:
            print(f"[{name}] could not reach {url}")

    @app.post("/search")
    async def search(request: dict):
        asyncio.create_task(reply(request))
        return {"message":{"ack":{"status":"ACK"}}}

    return app
