import asyncio
import json
import sys
import unittest
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

from bson import ObjectId
from fastapi import FastAPI, HTTPException
from starlette.requests import Request

from app.api import on_cancel as callback_module
from app.api import selection as selection_module
from app.core.config import settings
from app.schemas.confirmations import CancelRequest
from app.services import booking_cancellation
from protocol.contracts import ProtocolError

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "mock_providers"))
from test_on_init import _attempt_and_callback  # noqa: E402


def _attempt_and_cancel_callback():
    attempt, init_callback = _attempt_and_callback()
    confirmed = deepcopy(init_callback["message"]["order"])
    confirmed["state"] = "CONFIRMED"
    message_id = str(uuid4())
    attempt.update({
        "kind": "transport",
        "state": "CONFIRMED",
        "initState": "INITIALIZED",
        "confirmState": "CONFIRMED",
        "acceptedQuote": confirmed["quote"]["price"],
        "confirmedProviderResponse": {"message": {"order": confirmed}},
        "cancelState": "PENDING_PROVIDER",
        "cancelMessageId": message_id,
        "cancelReason": "Plans changed",
        "providerOrder": confirmed,
        "provider": {
            "id": init_callback["context"]["bpp_id"],
            "uri": init_callback["context"]["bpp_uri"],
        },
        "item": {
            "id": confirmed["items"][0]["id"],
            "provider_id": confirmed["provider"]["id"],
        },
        "requestedQuantity": confirmed["items"][0]["quantity"]["selected"]["count"],
    })
    cancelled = deepcopy(confirmed)
    cancelled.update({"state": "CANCELLED", "status": "CANCELLED"})
    cancelled["cancellation"] = {
        "time": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "cancelled_by": "CONSUMER",
        "reason": {
            "id": "TDE_USER_REQUEST",
            "descriptor": {"short_desc": "Plans changed"},
        },
    }
    callback = {
        "context": {
            **init_callback["context"],
            "action": "on_cancel",
            "bap_id": settings.bap_id,
            "bap_uri": settings.bap_uri,
            "message_id": message_id,
        },
        "message": {"order": cancelled},
    }
    return attempt, callback


def _request(payload, path="/api/on_cancel"):
    body = json.dumps(payload).encode()
    scope = {
        "type": "http",
        "method": "POST",
        "scheme": "http",
        "path": path,
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


class OnCancelCallbackTests(unittest.IsolatedAsyncioTestCase):
    async def _invoke(self, attempt, callback, invalid_signature=False, saved=None):
        repository = AsyncMock()
        repository.get_for_callback.return_value = attempt
        repository.update_cancel.return_value = saved or {
            **attempt,
            "state": "CANCELLED",
            "cancelState": "CANCELLED",
            "cancelledProviderResponse": callback,
        }
        request = _request(callback)
        if invalid_signature:
            request.app.state.beckn_identity.verify.side_effect = ProtocolError("Invalid signature")
        with patch.object(callback_module, "get_db", return_value=None), patch.object(
            callback_module, "TransportSelectionRepository", return_value=repository
        ), patch.object(callback_module, "finish", return_value=True):
            response = await callback_module.on_cancel(request)
        return response, repository

    async def test_signed_matching_cancellation_is_persisted(self):
        attempt, callback = _attempt_and_cancel_callback()
        response, repository = await self._invoke(attempt, callback)
        self.assertEqual(response["message"]["ack"]["status"], "ACK")
        repository.update_cancel.assert_awaited_once()
        kwargs = repository.update_cancel.await_args.kwargs
        self.assertEqual(kwargs["state"], "CANCELLED")
        self.assertEqual(kwargs.get("source", "ON_CANCEL"), "ON_CANCEL")
        self.assertEqual(kwargs["response"], callback)

    async def test_rejects_bad_signature_correlation_sender_and_changed_item(self):
        attempt, callback = _attempt_and_cancel_callback()
        response, repository = await self._invoke(attempt, callback, invalid_signature=True)
        self.assertEqual(response.status_code, 400)
        repository.update_cancel.assert_not_awaited()

        for mutate in (
            lambda payload: payload["context"].update(message_id=str(uuid4())),
            lambda payload: payload["context"].update(bpp_uri="http://untrusted.example"),
            lambda payload: payload["message"]["order"]["items"][0].update(id="another-item"),
        ):
            attempt, callback = _attempt_and_cancel_callback()
            mutate(callback)
            response, repository = await self._invoke(attempt, callback)
            self.assertEqual(response.status_code, 400)
            repository.update_cancel.assert_not_awaited()

    async def test_valid_late_callback_after_status_reconciliation_is_acked_without_overwrite(self):
        attempt, callback = _attempt_and_cancel_callback()
        attempt["cancelState"] = "CANCELLED"
        attempt["cancelSource"] = "ON_STATUS"
        attempt["cancelledProviderResponse"] = {"message": {"order": deepcopy(callback["message"]["order"])}}
        response, repository = await self._invoke(attempt, callback)
        self.assertEqual(response["message"]["ack"]["status"], "ACK")
        repository.update_cancel.assert_not_awaited()

    async def test_conflicting_duplicate_cancellation_is_rejected(self):
        attempt, callback = _attempt_and_cancel_callback()
        attempt["cancelState"] = "CANCELLED"
        attempt["cancelledProviderResponse"] = {"message": {"order": deepcopy(callback["message"]["order"])}}
        callback["message"]["order"]["cancellation"]["time"] = "2099-01-01T00:00:00Z"
        response, repository = await self._invoke(attempt, callback)
        self.assertEqual(response.status_code, 400)
        repository.update_cancel.assert_not_awaited()


class CancellationRequestTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancel_is_persisted_before_signed_provider_dispatch(self):
        attempt, _ = _attempt_and_cancel_callback()
        attempt["cancelState"] = None
        message_id = str(uuid4())
        pending = {
            **attempt,
            "cancelBusinessKey": "stable-cancel-key",
            "cancelMessageId": message_id,
            "cancelReason": "Plans changed",
            "cancelState": "CANCEL_REQUESTED",
        }
        claimed = {**pending, "cancelDispatching": True}
        completed = {**pending, "state": "CANCELLED", "cancelState": "CANCELLED"}
        repository = AsyncMock()
        repository.get_for_user.side_effect = [attempt, completed]
        events = []

        async def persist(**kwargs):
            events.append("persist")
            return pending

        async def dispatch(*args, **kwargs):
            events.append("dispatch")
            return {"ack": {"status": "ACK"}}

        repository.begin_cancel.side_effect = persist
        repository.claim_cancel_dispatch.return_value = claimed
        callback_future = asyncio.get_running_loop().create_future()
        callback_future.set_result({"message": {"order": {"state": "CANCELLED"}}})
        request = _request({})
        request.app.state.http_client = object()
        request.app.state.beckn_identity.address.return_value = "http://trusted-bpp"
        with patch.object(booking_cancellation, "get_db", return_value=None), patch.object(
            booking_cancellation, "TransportSelectionRepository", return_value=repository
        ), patch.object(booking_cancellation, "start", return_value=callback_future), patch.object(
            booking_cancellation, "signed_post", side_effect=dispatch
        ) as send_request, patch.object(booking_cancellation, "require_ack"), patch.object(
            booking_cancellation, "validate_message"
        ):
            result = await booking_cancellation.cancel_confirmed_order(
                selection_id=attempt["selectionId"],
                payload=CancelRequest(reason="Plans changed", confirm_cancellation=True),
                request=request,
                user={"_id": attempt["userId"]},
                kind="transport",
            )
        self.assertEqual(events, ["persist", "dispatch"])
        self.assertEqual(result["cancel_state"], "CANCELLED")
        self.assertEqual(send_request.await_args.args[1], "http://trusted-bpp/cancel")
        self.assertEqual(send_request.await_args.args[2]["context"]["message_id"], message_id)
        self.assertEqual(send_request.await_args.args[2]["context"]["transaction_id"], attempt["transactionId"])

    async def test_duplicate_pending_cancellation_does_not_redispatch(self):
        attempt, _ = _attempt_and_cancel_callback()
        attempt["cancelState"] = "PENDING_PROVIDER"
        repository = AsyncMock()
        repository.get_for_user.return_value = attempt
        with patch.object(booking_cancellation, "get_db", return_value=None), patch.object(
            booking_cancellation, "TransportSelectionRepository", return_value=repository
        ), patch.object(booking_cancellation, "signed_post", new=AsyncMock()) as send_request:
            result = await booking_cancellation.cancel_confirmed_order(
                selection_id=attempt["selectionId"],
                payload=CancelRequest(reason="Plans changed", confirm_cancellation=True),
                request=_request({}),
                user={"_id": attempt["userId"]},
                kind="transport",
            )
        self.assertEqual(result["cancel_state"], "PENDING_PROVIDER")
        repository.begin_cancel.assert_not_awaited()
        send_request.assert_not_awaited()

    async def test_csrf_is_required_before_booking_lookup(self):
        attempt, _ = _attempt_and_cancel_callback()
        request = _request({}, "/api/transport/selections/selection-1/cancel")
        request.scope["headers"] = [(b"origin", b"http://localhost:3000")]
        with patch.object(selection_module, "get_db") as get_db:
            with self.assertRaises(HTTPException) as error:
                await selection_module.cancel_transport_booking(
                    "selection-1",
                    CancelRequest(reason="Plans changed", confirm_cancellation=True),
                    request,
                    {"_id": ObjectId()},
                )
        self.assertEqual(error.exception.status_code, 403)
        get_db.assert_not_called()

    async def test_cancellation_requires_authenticated_booking_ownership(self):
        user_id = ObjectId()
        repository = AsyncMock()
        repository.get_for_user.return_value = None
        request = _request({}, "/api/transport/selections/selection-1/cancel")
        request.scope["headers"] = [
            (b"origin", b"http://localhost:3000"),
            (b"cookie", b"tde_csrf=token"),
            (b"x-csrf-token", b"token"),
        ]
        with patch.object(booking_cancellation, "get_db", return_value=None), patch.object(
            booking_cancellation, "TransportSelectionRepository", return_value=repository
        ):
            with self.assertRaises(HTTPException) as error:
                await selection_module.cancel_transport_booking(
                    "selection-1",
                    CancelRequest(reason="Plans changed", confirm_cancellation=True),
                    request,
                    {"_id": user_id},
                )
        self.assertEqual(error.exception.status_code, 404)
        repository.get_for_user.assert_awaited_once_with("selection-1", user_id)

    async def test_pending_confirmation_must_be_reconciled_before_cancel(self):
        attempt, _ = _attempt_and_cancel_callback()
        attempt["confirmState"] = "PENDING_PROVIDER"
        repository = AsyncMock()
        repository.get_for_user.return_value = attempt
        with patch.object(booking_cancellation, "get_db", return_value=None), patch.object(
            booking_cancellation, "TransportSelectionRepository", return_value=repository
        ):
            with self.assertRaises(HTTPException) as error:
                await booking_cancellation.cancel_confirmed_order(
                    selection_id=attempt["selectionId"],
                    payload=CancelRequest(reason="Plans changed", confirm_cancellation=True),
                    request=_request({}),
                    user={"_id": attempt["userId"]},
                    kind="transport",
                )
        self.assertEqual(error.exception.status_code, 409)
