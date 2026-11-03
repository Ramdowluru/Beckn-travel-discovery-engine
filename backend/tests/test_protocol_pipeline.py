"""Real ASGI HTTP routes and exact signed bytes; no Mongo/service side effects.

Uses in-process HTTP transport, not a claim of browser or TCP port verification.
"""
import asyncio
from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
import importlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch, AsyncMock

import httpx
from fastapi import FastAPI

from app.api.search import router as search_router
from app.api.on_search import router as callback_router
from app.core.config import settings
from protocol.signing import Identity
from scripts.provision_beckn_keys import provision

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "mock_providers"))
from common.server import create_app
from mock_gateway.main import app as gateway


class RoutingTransport(httpx.AsyncBaseTransport):
    def __init__(self, apps, down):
        self.apps = apps
        self.down = down
        self.calls = []

    async def handle_async_request(self, request):
        port = request.url.port
        self.calls.append((port, request.url.path))
        if port in self.down or port not in self.apps:
            raise httpx.ConnectError("Simulated unavailable participant", request=request)
        return await httpx.ASGITransport(app=self.apps[port]).handle_async_request(request)


class PipelineTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        home = Path(self.temp.name)
        provision(home, settings.bap_id, settings.bap_uri)
        self.stack = ExitStack()
        self.stack.enter_context(patch.dict("os.environ", {"BECKN_KEYS_DIR": str(home), "DELAY_SECONDS": "0", "FAIL_RATE": "0"}))
        self.stack.enter_context(patch.object(settings, "gateway_url", "http://localhost:9000"))
        self.stack.enter_context(patch.object(settings, "search_timeout_seconds", .2))
        self.repository = AsyncMock()
        module = importlib.import_module("app.api.search")
        self.stack.enter_context(patch.object(module, "TransportSnapshotRepository", return_value=self.repository))
        self.stack.enter_context(patch.object(module, "get_db", return_value=None))
        bap = FastAPI(); bap.include_router(search_router); bap.include_router(callback_router)
        self.apps = {8000: bap, 9000: gateway}
        for port, name in ((5001, "bus"), (5002, "train"), (5003, "flight")):
            self.apps[port] = create_app(ROOT / "mock_providers" / ("mock_" + name))
        self.down = set()
        self.transport = RoutingTransport(self.apps, self.down)
        self.client = httpx.AsyncClient(transport=self.transport)
        for port, app in self.apps.items():
            identity = settings.bap_id if port == 8000 else "mock-gateway.example.in" if port == 9000 else {5001:"mock-bus.example.in",5002:"mock-train.example.in",5003:"mock-flight.example.in"}[port]
            app.state.beckn_identity = Identity.load(identity)
            app.state.http_client = self.client

    async def asyncTearDown(self):
        await self.client.aclose()
        self.stack.close()
        self.temp.cleanup()

    async def search(self, origin="Vijayawada", travellers=2):
        tomorrow = (datetime.now(timezone(timedelta(hours=5, minutes=30))).date()+timedelta(days=1)).isoformat()
        return await self.client.get("http://localhost:8000/api/search", params={"from":origin,"to":"Hyderabad","date":tomorrow,"travellers":travellers,"tab":"travel"})

    async def test_signed_gateway_three_providers_callbacks_and_snapshot(self):
        for _ in range(2):
            response = await self.search()
            self.assertEqual(response.status_code, 200, response.text)
            data = response.json()
            self.assertEqual(data["providers_expected"], 3)
            self.assertEqual(data["providers_replied"], 3)
            self.assertFalse(data["partial_results"])
            self.assertEqual(data["counts"]["transport"], 8)
            self.assertTrue(all(o["totalPrice"] == o["unitPrice"]*2 for o in data["transport"]))
        self.assertEqual(self.repository.save_many.await_count, 2)
        self.assertEqual(sum(p==8000 and path=="/api/on_search" for p,path in self.transport.calls), 6)

    async def test_partial_empty_and_zero_provider_recovery(self):
        self.down.add(5001)
        response = await self.search()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["providers_replied"], 2)
        self.assertEqual(response.json()["counts"]["transport"], 5)
        self.assertTrue(response.json()["partial_results"])
        response = await self.search("Unsupported city")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["counts"]["transport"], 0)
        self.assertTrue(response.json()["partial_results"])
        self.down.update({5002,5003})
        self.assertEqual((await self.search()).status_code, 504)
        self.down.clear()
        self.assertEqual((await self.search()).json()["counts"]["transport"], 8)

    async def test_unsigned_gateway_provider_and_callback_rejected(self):
        from backend.tests.test_protocol_recovery import pair
        request, callback = pair()
        for port, path, payload in ((9000,"/search",request),(5001,"/search",request),(8000,"/api/on_search",callback)):
            response = await self.client.post(f"http://localhost:{port}{path}", json=payload)
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()["message"]["ack"]["status"], "NACK")
            self.assertIn("error", response.json())
