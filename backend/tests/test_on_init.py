import asyncio
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import unittest
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

from fastapi import FastAPI
from fastapi import HTTPException
from starlette.requests import Request
from bson import ObjectId

from app.api import on_init as callback_module
from app.api import selection as selection_module
from app.schemas.selections import TransportInitRequest
from app.services.beckn_order_builder import build_transport_init, build_transport_select
from common.beckn_converter import build_on_init, build_on_select

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "mock_providers"))


def _attempt_and_callback():
    data = json.loads((ROOT / "mock_providers" / "mock_bus" / "data.json").read_text(encoding="utf-8"))
    transaction_id = str(uuid4())
    init_message_id = str(uuid4())
    provider = {"id": data["provider"]["bpp_id"], "uri": data["provider"]["bpp_uri"]}
    select_request = build_transport_select(
        transaction_id=transaction_id,
        message_id=str(uuid4()),
        provider=provider,
        item={"id": "BUS-001", "provider_id": data["provider"]["id"]},
        fulfillment={},
        quantity=1,
        travel_date=(datetime.now(timezone.utc).date() + timedelta(days=1)).isoformat(),
    )
    selected = build_on_select(data, select_request)["message"]["order"]
    details = {
        "travellers": [{"name": "A Traveller"}],
        "contact_email": "traveller@example.com",
        "contact_phone": "1234567890",
    }
    init_request = build_transport_init(
        transaction_id=transaction_id,
        message_id=init_message_id,
        provider=provider,
        item={"id": "BUS-001", "provider_id": data["provider"]["id"]},
        quantity=1,
        quote=selected["quote"],
        fulfillment=selected["items"][0]["fulfillment"],
        details=details,
        quote_expires_at="2099-01-01T00:00:00Z",
    )
    callback = build_on_init(data, init_request)
    attempt = {
        "selectionId": "selection-1",
        "userId": "user-1",
        "transactionId": transaction_id,
        "initMessageId": init_message_id,
        "initState": "INIT_REQUESTED",
        "provider": provider,
        "item": {"id": "BUS-001", "provider_id": data["provider"]["id"]},
        "requestedQuantity": 1,
        "quote": selected["quote"],
    }
    return attempt, callback


def _request(payload):
    body = json.dumps(payload).encode()
    scope = {
        "type": "http",
        "method": "POST",
        "scheme": "http",
        "path": "/api/on_init",
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


def _browser_request():
    scope = {
        "type": "http",
        "method": "POST",
        "scheme": "http",
        "path": "/api/transport/selections/selection-1/init",
        "headers": [
            (b"origin", b"http://localhost:3000"),
            (b"x-csrf-token", b"csrf-token"),
            (b"cookie", b"tde_csrf=csrf-token"),
        ],
        "query_string": b"",
        "server": ("localhost", 3000),
        "client": ("127.0.0.1", 1),
    }
    return Request(scope)


class OnInitCallbackTests(unittest.IsolatedAsyncioTestCase):
    async def test_success_is_persisted_even_when_browser_waiter_is_gone(self):
        attempt, callback = _attempt_and_callback()
        attempt["initState"] = "PENDING_PROVIDER"
        repository = AsyncMock()
        repository.get_for_callback.return_value = attempt
        with patch.object(callback_module, "get_db", return_value=None), patch.object(
            callback_module, "TransportSelectionRepository", return_value=repository
        ):
            response = await callback_module.on_init(_request(callback))
        self.assertEqual(response["message"]["ack"]["status"], "ACK")
        repository.update_init.assert_awaited_once()
        self.assertEqual(repository.update_init.await_args.kwargs["state"], "INITIALIZED")
        self.assertIn("PENDING_PROVIDER", repository.update_init.await_args.kwargs["expected_states"])
        self.assertIsInstance(repository.update_init.await_args.kwargs["order"], dict)

    async def test_provider_error_callback_is_persisted_without_order_access(self):
        attempt, callback = _attempt_and_callback()
        callback = {
            "context": callback["context"],
            "error": {"code": "30005", "message": "No availability."},
        }
        repository = AsyncMock()
        repository.get_for_callback.return_value = attempt
        with patch.object(callback_module, "get_db", return_value=None), patch.object(
            callback_module, "TransportSelectionRepository", return_value=repository
        ):
            response = await callback_module.on_init(_request(callback))
        self.assertEqual(response["message"]["ack"]["status"], "ACK")
        repository.update_init.assert_awaited_once()
        self.assertEqual(repository.update_init.await_args.kwargs["state"], "INIT_FAILED")

    async def test_mismatched_sender_is_rejected(self):
        attempt, callback = _attempt_and_callback()
        callback["context"]["bpp_id"] = "untrusted.example"
        repository = AsyncMock()
        repository.get_for_callback.return_value = attempt
        with patch.object(callback_module, "get_db", return_value=None), patch.object(
            callback_module, "TransportSelectionRepository", return_value=repository
        ):
            response = await callback_module.on_init(_request(callback))
        self.assertEqual(response.status_code, 400)
        repository.update_init.assert_not_awaited()

    async def test_concurrent_callback_loser_is_nacked(self):
        attempt, callback = _attempt_and_callback()
        repository = AsyncMock()
        repository.get_for_callback.return_value = attempt
        repository.update_init.return_value = None
        with patch.object(callback_module, "get_db", return_value=None), patch.object(
            callback_module, "TransportSelectionRepository", return_value=repository
        ):
            response = await callback_module.on_init(_request(callback))
        self.assertEqual(response.status_code, 400)

    async def test_init_requires_owned_selection_and_unexpired_quote(self):
        repository = AsyncMock()
        repository.get_for_user.return_value = None
        payload = TransportInitRequest(
            travellers=[{"name": "A Traveller"}],
            contact_email="traveller@example.com",
            contact_phone="1234567890",
        )
        user = {"_id": ObjectId()}
        with patch.object(selection_module, "get_db", return_value=None), patch.object(
            selection_module, "TransportSelectionRepository", return_value=repository
        ):
            with self.assertRaises(HTTPException) as missing:
                await selection_module.init_transport("selection-1", payload, _browser_request(), user)
            self.assertEqual(missing.exception.status_code, 404)

            repository.get_for_user.return_value = {
                "selectionId": "selection-1",
                "state": "SELECTED",
                "quoteExpiresAt": datetime(2000, 1, 1, tzinfo=timezone.utc),
            }
            with self.assertRaises(HTTPException) as expired:
                await selection_module.init_transport("selection-1", payload, _browser_request(), user)
            self.assertEqual(expired.exception.status_code, 409)

    async def test_init_rejects_traveller_count_different_from_selected_quantity(self):
        repository = AsyncMock()
        repository.get_for_user.return_value = {
            "selectionId": "selection-1",
            "state": "SELECTED",
            "quoteExpiresAt": datetime(2099, 1, 1, tzinfo=timezone.utc),
            "requestedQuantity": 2,
        }
        payload = TransportInitRequest(
            travellers=[{"name": "A Traveller"}],
            contact_email="traveller@example.com",
            contact_phone="1234567890",
        )
        with patch.object(selection_module, "get_db", return_value=None), patch.object(
            selection_module, "TransportSelectionRepository", return_value=repository
        ):
            with self.assertRaises(HTTPException) as mismatch:
                await selection_module.init_transport(
                    "selection-1", payload, _browser_request(), {"_id": ObjectId()}
                )
        self.assertEqual(mismatch.exception.status_code, 422)

    def test_naive_mongo_quote_expiry_is_interpreted_as_utc(self):
        naive = datetime(2099, 1, 1)
        self.assertEqual(
            selection_module._utc_datetime(naive),
            naive.replace(tzinfo=timezone.utc),
        )

    async def test_init_dispatch_uses_persisted_claim_and_completes(self):
        selected_attempt, callback = _attempt_and_callback()
        user_id = ObjectId()
        now = datetime.now(timezone.utc)
        selected_attempt.update({
            "userId": user_id,
            "state": "SELECTED",
            "quoteExpiresAt": (now + timedelta(minutes=5)).replace(tzinfo=None),
            "requestedQuantity": 1,
            "fulfillment": {},
        })
        init_message_id = str(uuid4())
        init_attempt = {**selected_attempt, "initMessageId": init_message_id}
        callback["context"]["message_id"] = init_message_id
        callback["context"]["transaction_id"] = selected_attempt["transactionId"]

        repository = AsyncMock()
        repository.get_for_user.return_value = selected_attempt
        repository.begin_init.return_value = init_attempt
        repository.claim_init_dispatch.return_value = init_attempt
        future = asyncio.get_running_loop().create_future()
        future.set_result(callback)
        request = _browser_request()
        request.scope["app"] = FastAPI()
        request.app.state.http_client = Mock()
        request.app.state.beckn_identity = Mock()
        payload = TransportInitRequest(
            travellers=[{"name": "A Traveller"}],
            contact_email="traveller@example.com",
            contact_phone="1234567890",
        )

        with patch.object(selection_module, "get_db", return_value=None), patch.object(
            selection_module, "TransportSelectionRepository", return_value=repository
        ), patch.object(selection_module, "start", return_value=future) as start_callback, patch.object(
            selection_module, "signed_post", new=AsyncMock()
        ) as send_request, patch.object(selection_module, "require_ack"), patch.object(
            selection_module, "validate_message"
        ):
            result = await selection_module.init_transport(
                "selection-1", payload, request, {"_id": user_id}
            )

        self.assertEqual(result["state"], "INITIALIZED")
        self.assertTrue(result["order"])
        start_callback.assert_called_once_with(selected_attempt["transactionId"], init_message_id)
        sent_message = send_request.await_args.args[2]
        self.assertEqual(sent_message["context"]["message_id"], init_message_id)

    async def test_duplicate_init_submission_does_not_dispatch_again(self):
        selected_attempt, _ = _attempt_and_callback()
        user_id = ObjectId()
        selected_attempt.update({
            "userId": user_id,
            "state": "SELECTED",
            "quoteExpiresAt": datetime.now(timezone.utc) + timedelta(minutes=5),
            "requestedQuantity": 1,
        })
        init_attempt = {
            **selected_attempt,
            "initMessageId": str(uuid4()),
            "initState": "INIT_REQUESTED",
        }
        repository = AsyncMock()
        repository.get_for_user.return_value = selected_attempt
        repository.begin_init.return_value = init_attempt
        repository.claim_init_dispatch.return_value = None
        request = _browser_request()
        request.scope["app"] = FastAPI()
        payload = TransportInitRequest(
            travellers=[{"name": "A Traveller"}],
            contact_email="traveller@example.com",
            contact_phone="1234567890",
        )

        with patch.object(selection_module, "get_db", return_value=None), patch.object(
            selection_module, "TransportSelectionRepository", return_value=repository
        ), patch.object(selection_module, "signed_post", new=AsyncMock()) as send_request:
            result = await selection_module.init_transport(
                "selection-1", payload, request, {"_id": user_id}
            )

        self.assertEqual(result["state"], "PENDING")
        send_request.assert_not_awaited()
