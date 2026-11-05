import asyncio
import json
import sys
import unittest
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import httpx
from bson import ObjectId
from fastapi import FastAPI, HTTPException
from starlette.requests import Request

from app.api import on_confirm as callback_module
from app.api import selection as selection_module
from app.core.config import settings
from app.schemas.confirmations import ConfirmRequest
from app.services.confirmation import confirm_initialized_order
from protocol.contracts import ProtocolError

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "mock_providers"))
from test_on_init import _attempt_and_callback  # noqa: E402


def _attempt_callback():
    attempt, init_callback = _attempt_and_callback()
    initialized = deepcopy(init_callback["message"]["order"])
    transaction_id = attempt["transactionId"]
    message_id = str(uuid4())
    attempt.update({
        "kind": "transport",
        "state": "INITIALIZED",
        "initState": "INITIALIZED",
        "providerOrder": initialized,
        "providerOrderExpiresAt": datetime.now(timezone.utc) + timedelta(minutes=5),
        "confirmState": "PENDING_PROVIDER",
        "confirmMessageId": message_id,
        "acceptedQuote": initialized["quote"]["price"],
    })
    confirmed = deepcopy(initialized)
    confirmed["state"] = "CONFIRMED"
    return attempt, {
        "context": {
            **init_callback["context"],
            "action": "on_confirm",
            "bap_id": settings.bap_id,
            "bap_uri": settings.bap_uri,
            "message_id": message_id,
        },
        "message": {"order": confirmed},
    }


def _request(payload):
    body = json.dumps(payload).encode()
    scope = {
        "type": "http",
        "method": "POST",
        "scheme": "http",
        "path": "/api/on_confirm",
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


class OnConfirmCallbackTests(unittest.IsolatedAsyncioTestCase):
    async def _invoke(self, attempt, callback, update=None, invalid_signature=False):
        repository = AsyncMock()
        repository.get_for_callback.return_value = attempt
        repository.update_confirm.return_value = update if update is not None else attempt
        request = _request(callback)
        if invalid_signature:
            request.app.state.beckn_identity.verify.side_effect = ProtocolError("Invalid signature")
        with patch.object(callback_module, "get_db", return_value=None), patch.object(
            callback_module, "TransportSelectionRepository", return_value=repository
        ):
            response = await callback_module.on_confirm(request)
        return response, repository

    async def test_late_signed_confirm_is_persisted_for_pending_attempt(self):
        attempt, callback = _attempt_callback()
        response, repository = await self._invoke(attempt, callback)
        self.assertEqual(response["message"]["ack"]["status"], "ACK")
        repository.update_confirm.assert_awaited_once()
        kwargs = repository.update_confirm.await_args.kwargs
        self.assertEqual(kwargs["state"], "CONFIRMED")
        self.assertEqual(kwargs["response"], callback)
        self.assertIn("PENDING_PROVIDER", kwargs["expected_states"])

    async def test_rejects_mismatched_sender_order_item_price_and_paid_status(self):
        for mutate in (
            lambda callback: callback["context"].update(bpp_id="untrusted.example"),
            lambda callback: callback["message"]["order"].update(id="other-order"),
            lambda callback: callback["message"]["order"]["items"][0].update(id="other-item"),
            lambda callback: callback["message"]["order"]["quote"]["price"].update(value="1.00"),
            lambda callback: callback["message"]["order"]["payments"][0].update(status="PAID"),
        ):
            with self.subTest(mutation=mutate):
                attempt, callback = _attempt_callback()
                mutate(callback)
                response, repository = await self._invoke(attempt, callback)
                self.assertEqual(response.status_code, 400)
                repository.update_confirm.assert_not_awaited()

    async def test_rejects_wrong_correlation_and_duplicate_callback(self):
        attempt, callback = _attempt_callback()
        callback["context"]["message_id"] = str(uuid4())
        response, repository = await self._invoke(attempt, callback)
        self.assertEqual(response.status_code, 400)
        repository.update_confirm.assert_not_awaited()

        attempt, callback = _attempt_callback()
        attempt["confirmState"] = "CONFIRMED"
        attempt["confirmedProviderResponse"] = callback
        response, repository = await self._invoke(attempt, callback)
        self.assertEqual(response["message"]["ack"]["status"], "ACK")
        repository.update_confirm.assert_not_awaited()

        conflicting_callback = deepcopy(callback)
        conflicting_callback["message"]["order"]["quote"]["price"]["value"] = "451.00"
        response, repository = await self._invoke(attempt, conflicting_callback)
        self.assertEqual(response.status_code, 400)
        repository.update_confirm.assert_not_awaited()

    async def test_rejects_invalid_callback_signature(self):
        attempt, callback = _attempt_callback()
        response, repository = await self._invoke(attempt, callback, invalid_signature=True)
        self.assertEqual(response.status_code, 400)
        repository.update_confirm.assert_not_awaited()

        attempt, callback = _attempt_callback()
        attempt["confirmState"] = "CONFIRMED"
        response, repository = await self._invoke(attempt, callback)
        self.assertEqual(response.status_code, 400)
        repository.update_confirm.assert_not_awaited()


class ConfirmationRequestTests(unittest.IsolatedAsyncioTestCase):
    def _attempt(self, state="INITIALIZED"):
        attempt, callback = _attempt_callback()
        attempt.update({
            "state": state,
            "initState": "INITIALIZED",
            "confirmState": None,
            "providerOrderExpiresAt": datetime.now(timezone.utc) + timedelta(minutes=5),
        })
        return attempt, callback

    async def test_requires_user_owned_initialized_order_and_unexpired_quote(self):
        attempt, _ = self._attempt()
        repository = AsyncMock()
        repository.get_for_user.return_value = None
        request = Mock()
        user = {"_id": ObjectId()}
        payload = ConfirmRequest(
            accept_final_quote=True,
            accepted_quote=attempt["providerOrder"]["quote"]["price"],
        )
        with patch("app.services.confirmation.get_db", return_value=None), patch(
            "app.services.confirmation.TransportSelectionRepository", return_value=repository
        ):
            with self.assertRaises(HTTPException) as missing:
                await confirm_initialized_order(
                    selection_id="selection-1", payload=payload, request=request, user=user, kind="transport"
                )
            self.assertEqual(missing.exception.status_code, 404)

            repository.get_for_user.return_value = attempt
            attempt["providerOrderExpiresAt"] = datetime(2000, 1, 1, tzinfo=timezone.utc)
            with self.assertRaises(HTTPException) as expired:
                await confirm_initialized_order(
                    selection_id="selection-1", payload=payload, request=request, user=user, kind="transport"
                )
            self.assertEqual(expired.exception.status_code, 409)

    async def test_browser_confirmation_requires_csrf(self):
        attempt, _ = self._attempt()
        request = Request({
            "type": "http",
            "method": "POST",
            "scheme": "http",
            "path": "/api/transport/selections/selection-1/confirm",
            "headers": [(b"origin", b"http://localhost:3000")],
            "query_string": b"",
            "server": ("localhost", 8000),
            "client": ("127.0.0.1", 1),
        })
        payload = ConfirmRequest(
            accept_final_quote=True,
            accepted_quote=attempt["providerOrder"]["quote"]["price"],
        )
        with self.assertRaises(HTTPException) as csrf:
            await selection_module.confirm_transport(
                "selection-1",
                payload,
                request,
                {"_id": ObjectId()},
            )
        self.assertEqual(csrf.exception.status_code, 403)

    async def test_explicit_acceptance_must_be_true(self):
        with self.assertRaises(ValueError):
            ConfirmRequest(
                accept_final_quote=False,
                accepted_quote={"currency": "INR", "value": "450.00"},
            )

    async def test_confirmation_dispatch_uses_persisted_fresh_correlation(self):
        attempt, callback = self._attempt()
        claimed = {
            **attempt,
            "confirmState": "CONFIRM_REQUESTED",
            "confirmBusinessKey": "stable-key",
        }
        confirmed = {**claimed, "confirmState": "CONFIRMED", "state": "CONFIRMED"}
        repository = AsyncMock()
        repository.get_for_user.side_effect = [attempt, confirmed]
        repository.begin_confirm.return_value = claimed
        repository.claim_confirm_dispatch.return_value = claimed
        request = Mock()
        request.app.state.beckn_identity.address.return_value = attempt["provider"]["uri"]
        request.app.state.beckn_identity.check_address.return_value = None
        request.app.state.http_client = Mock()
        payload = ConfirmRequest(
            accept_final_quote=True,
            accepted_quote=attempt["providerOrder"]["quote"]["price"],
        )
        response = httpx.Response(200, json={"message": {"ack": {"status": "ACK"}}})
        future = asyncio.get_running_loop().create_future()
        future.set_result(callback)
        with patch("app.services.confirmation.get_db", return_value=None), patch(
            "app.services.confirmation.TransportSelectionRepository", return_value=repository
        ), patch("app.services.confirmation.start", return_value=future), patch(
            "app.services.confirmation.signed_post", new=AsyncMock(return_value=response)
        ) as signed_post:
            result = await confirm_initialized_order(
                selection_id=attempt["selectionId"],
                payload=payload,
                request=request,
                user={"_id": attempt["userId"]},
                kind="transport",
            )
        message = signed_post.await_args.args[2]
        self.assertEqual(message["context"]["action"], "confirm")
        self.assertEqual(message["context"]["transaction_id"], attempt["transactionId"])
        self.assertEqual(message["context"]["message_id"], attempt["confirmMessageId"])
        self.assertEqual(result["confirm_state"], "CONFIRMED")

    async def test_pending_repeat_does_not_dispatch_again(self):
        attempt, _ = self._attempt()
        attempt["confirmState"] = "PENDING_PROVIDER"
        repository = AsyncMock()
        repository.get_for_user.return_value = attempt
        payload = ConfirmRequest(
            accept_final_quote=True,
            accepted_quote=attempt["providerOrder"]["quote"]["price"],
        )
        with patch("app.services.confirmation.get_db", return_value=None), patch(
            "app.services.confirmation.TransportSelectionRepository", return_value=repository
        ), patch("app.services.confirmation.signed_post", new=AsyncMock()) as signed_post:
            result = await confirm_initialized_order(
                selection_id=attempt["selectionId"],
                payload=payload,
                request=Mock(),
                user={"_id": attempt["userId"]},
                kind="transport",
            )
        self.assertEqual(result["state"], "PENDING")
        signed_post.assert_not_awaited()
