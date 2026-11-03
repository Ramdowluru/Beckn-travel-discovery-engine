import json
from pathlib import Path
import sys
import unittest
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

from fastapi import FastAPI
from starlette.requests import Request

from app.api import on_select as callback_module
from app.services.beckn_order_builder import build_transport_select
from common.beckn_converter import build_on_select
from protocol.contracts import ProtocolError

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "mock_providers"))


def _attempt_and_callback(state="SELECT_REQUESTED"):
    data = json.loads((ROOT / "mock_providers" / "mock_bus" / "data.json").read_text(encoding="utf-8"))
    transaction_id = str(uuid4())
    message_id = str(uuid4())
    provider = {"id": data["provider"]["bpp_id"], "uri": data["provider"]["bpp_uri"]}
    select_request = build_transport_select(
        transaction_id=transaction_id,
        message_id=message_id,
        provider=provider,
        item={"id": "BUS-001", "provider_id": data["provider"]["id"]},
        fulfillment={},
        quantity=1,
        travel_date="2026-10-28",
    )
    callback = build_on_select(data, select_request)
    attempt = {
        "selectionId": "selection-1",
        "userId": "user-1",
        "transactionId": transaction_id,
        "messageId": message_id,
        "provider": provider,
        "item": {"id": "BUS-001", "provider_id": data["provider"]["id"]},
        "requestedQuantity": 1,
        "state": state,
    }
    return attempt, callback


def _request(payload):
    body = json.dumps(payload).encode()
    scope = {
        "type": "http",
        "method": "POST",
        "scheme": "http",
        "path": "/api/on_select",
        "headers": [(b"content-type", b"application/json")],
        "query_string": b"",
        "server": ("localhost", 8000),
        "client": ("127.0.0.1", 1),
    }
    request = Request(scope, receive=lambda: {"type": "http.request", "body": body, "more_body": False})
    request._body = body
    app = FastAPI()
    app.state.beckn_identity = Mock()
    app.state.beckn_identity.verify.return_value = None
    app.state.beckn_identity.check_address.return_value = None
    request.scope["app"] = app
    return request


class OnSelectCallbackTests(unittest.IsolatedAsyncioTestCase):
    async def test_successful_callback_persists_even_if_waiter_is_gone(self):
        attempt, callback = _attempt_and_callback()
        repository = AsyncMock()
        repository.get_for_callback.return_value = attempt
        repository.update_result.return_value = {"state": "SELECTED"}
        with patch.object(callback_module, "get_db", return_value=None), patch.object(
            callback_module, "TransportSelectionRepository", return_value=repository
        ):
            response = await callback_module.on_select(_request(callback))
        self.assertEqual(response["message"]["ack"]["status"], "ACK")
        repository.update_result.assert_awaited_once()
        args = repository.update_result.await_args.kwargs
        self.assertEqual(args["state"], "SELECTED")
        self.assertEqual(args["quote"], callback["message"]["order"]["quote"])
        self.assertEqual(args["expected_states"], ["SELECT_REQUESTED", "PENDING_PROVIDER"])

    async def test_late_callback_recovers_pending_attempt(self):
        attempt, callback = _attempt_and_callback(state="PENDING_PROVIDER")
        repository = AsyncMock()
        repository.get_for_callback.return_value = attempt
        repository.update_result.return_value = {"state": "SELECTED"}
        with patch.object(callback_module, "get_db", return_value=None), patch.object(
            callback_module, "TransportSelectionRepository", return_value=repository
        ):
            response = await callback_module.on_select(_request(callback))
        self.assertEqual(response["message"]["ack"]["status"], "ACK")
        self.assertEqual(repository.update_result.await_args.kwargs["state"], "SELECTED")

    async def test_invalid_signature_is_rejected_without_state_change(self):
        attempt, callback = _attempt_and_callback()
        repository = AsyncMock()
        repository.get_for_callback.return_value = attempt
        request = _request(callback)
        request.app.state.beckn_identity.verify.side_effect = ProtocolError("Invalid signature")
        with patch.object(callback_module, "get_db", return_value=None), patch.object(
            callback_module, "TransportSelectionRepository", return_value=repository
        ):
            response = await callback_module.on_select(request)
        self.assertEqual(response.status_code, 400)
        repository.update_result.assert_not_awaited()

    async def test_duplicate_callback_does_not_update_attempt(self):
        attempt, callback = _attempt_and_callback(state="SELECTED")
        repository = AsyncMock()
        repository.get_for_callback.return_value = attempt
        with patch.object(callback_module, "get_db", return_value=None), patch.object(
            callback_module, "TransportSelectionRepository", return_value=repository
        ):
            response = await callback_module.on_select(_request(callback))
        self.assertEqual(response.status_code, 400)
        repository.update_result.assert_not_awaited()
