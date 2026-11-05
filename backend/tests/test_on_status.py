import json
import os
import sys
import tempfile
import unittest
from copy import deepcopy
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import asyncio
import httpx
from fastapi import FastAPI
from starlette.requests import Request

from app.api import on_status as callback_module
from app.api import selection as selection_module
from app.core.config import settings
from app.services.booking_status import refresh_booking_status
from common.confirmation import build_on_confirm
from common.inventory import inventory_key, with_current_inventory
from common.order_store import get_inventory_available, get_order, save_initialized_order
from common.status import build_on_status
from app.services.confirm_order_builder import build_confirm
from app.services.status_order_builder import build_status
from protocol.contracts import ProtocolError, ack

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "mock_providers"))
from test_on_init import _attempt_and_callback  # noqa: E402


def _attempt_and_status():
    attempt, init_callback = _attempt_and_callback()
    initialized = deepcopy(init_callback["message"]["order"])
    confirm_message_id = str(uuid4())
    status_message_id = str(uuid4())
    attempt.update({
        "kind": "transport",
        "state": "INITIALIZED",
        "initState": "INITIALIZED",
        "providerOrder": initialized,
        "confirmState": "PENDING_PROVIDER",
        "confirmMessageId": confirm_message_id,
        "acceptedQuote": initialized["quote"]["price"],
        "provider": {
            "id": init_callback["context"]["bpp_id"],
            "uri": init_callback["context"]["bpp_uri"],
        },
        "item": {
            "id": initialized["items"][0]["id"],
            "provider_id": initialized["provider"]["id"],
        },
        "requestedQuantity": initialized["items"][0]["quantity"]["selected"]["count"],
    })
    order = deepcopy(initialized)
    order["state"] = "CONFIRMED"
    order["tags"].append({
        "descriptor": {"code": "TDE_PRICE_ACCEPTANCE"},
        "list": [
            {"descriptor": {"code": "ACCEPTED"}, "value": "true"},
            {"descriptor": {"code": "CURRENCY"}, "value": order["quote"]["price"]["currency"]},
            {"descriptor": {"code": "AMOUNT"}, "value": order["quote"]["price"]["value"]},
        ],
    })
    callback = {
        "context": {
            **init_callback["context"],
            "action": "on_status",
            "bap_id": settings.bap_id,
            "bap_uri": settings.bap_uri,
            "message_id": status_message_id,
        },
        "message": {"order": order},
    }
    action = {
        "transactionId": attempt["transactionId"],
        "messageId": status_message_id,
        "selectionId": attempt["selectionId"],
        "userId": attempt["userId"],
        "providerId": attempt["provider"]["id"],
        "orderId": initialized["id"],
        "state": "PENDING_PROVIDER",
    }
    attempt["latestStatusMessageId"] = status_message_id
    return attempt, action, callback


def _request(payload):
    body = json.dumps(payload).encode()
    scope = {
        "type": "http",
        "method": "POST",
        "scheme": "http",
        "path": "/api/on_status",
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


def _cancelled_status():
    attempt, action, callback = _attempt_and_status()
    confirmed = deepcopy(callback["message"]["order"])
    confirmed["state"] = "CONFIRMED"
    attempt.update({
        "state": "CONFIRMED",
        "confirmState": "CONFIRMED",
        "confirmedProviderResponse": {"message": {"order": confirmed}},
        "cancelState": "PENDING_PROVIDER",
        "cancelMessageId": str(uuid4()),
        "cancelReason": "Plans changed",
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
    callback["message"]["order"] = cancelled
    return attempt, action, callback


class OnStatusCallbackTests(unittest.IsolatedAsyncioTestCase):
    async def _invoke(self, attempt, action, callback, invalid_signature=False, latest=True):
        repository = AsyncMock()
        repository.get_status_for_callback.return_value = (
            (attempt, action)
            if callback["context"]["transaction_id"] == action["transactionId"]
            and callback["context"]["message_id"] == action["messageId"]
            else None
        )
        repository.update_status_action.return_value = {**action, "state": "STATUS_RECEIVED", "response": callback}
        repository.update_latest_status.return_value = attempt if latest else None
        repository.update_confirm.return_value = {
            **attempt,
            "state": "CONFIRMED",
            "confirmState": "CONFIRMED",
            "confirmSource": "ON_STATUS",
        }
        request = _request(callback)
        if invalid_signature:
            request.app.state.beckn_identity.verify.side_effect = ProtocolError("Invalid signature")
        with patch.object(callback_module, "get_db", return_value=None), patch.object(
            callback_module, "TransportSelectionRepository", return_value=repository
        ), patch.object(callback_module, "finish", return_value=True):
            response = await callback_module.on_status(request)
        return response, repository

    async def test_confirmed_provider_status_reconciles_pending_confirmation(self):
        attempt, action, callback = _attempt_and_status()
        response, repository = await self._invoke(attempt, action, callback)
        self.assertEqual(response["message"]["ack"]["status"], "ACK")
        repository.update_confirm.assert_awaited_once()
        kwargs = repository.update_confirm.await_args.kwargs
        self.assertEqual(kwargs["state"], "CONFIRMED")
        self.assertEqual(kwargs["source"], "ON_STATUS")
        self.assertIn("PENDING_PROVIDER", kwargs["expected_states"])

    async def test_initialized_provider_status_does_not_resolve_pending_confirmation(self):
        attempt, action, callback = _attempt_and_status()
        callback["message"]["order"]["state"] = "INITIALIZED"
        callback["message"]["order"]["tags"] = deepcopy(attempt["providerOrder"]["tags"])
        response, repository = await self._invoke(attempt, action, callback)
        self.assertEqual(response["message"]["ack"]["status"], "ACK")
        repository.update_confirm.assert_not_awaited()

    async def test_provider_not_found_status_does_not_fail_or_confirm_booking(self):
        attempt, action, callback = _attempt_and_status()
        callback.pop("message")
        callback["error"] = {"code": "30005", "message": "Order not found."}
        response, repository = await self._invoke(attempt, action, callback)
        self.assertEqual(response["message"]["ack"]["status"], "ACK")
        repository.update_confirm.assert_not_awaited()
        repository.update_latest_status.assert_awaited_once()

    async def test_rejects_bad_signature_correlation_and_order_identity(self):
        attempt, action, callback = _attempt_and_status()
        response, repository = await self._invoke(attempt, action, callback, invalid_signature=True)
        self.assertEqual(response.status_code, 400)
        repository.update_status_action.assert_not_awaited()

        attempt, action, callback = _attempt_and_status()
        callback["context"]["message_id"] = str(uuid4())
        response, repository = await self._invoke(attempt, action, callback)
        self.assertEqual(response.status_code, 400)
        repository.update_status_action.assert_not_awaited()

        attempt, action, callback = _attempt_and_status()
        callback["context"]["bpp_uri"] = "http://untrusted.example"
        response, repository = await self._invoke(attempt, action, callback)
        self.assertEqual(response.status_code, 400)
        repository.update_status_action.assert_not_awaited()

        attempt, action, callback = _attempt_and_status()
        callback["context"]["bpp_id"] = "untrusted.example"
        response, repository = await self._invoke(attempt, action, callback)
        self.assertEqual(response.status_code, 400)
        repository.update_status_action.assert_not_awaited()

        attempt, action, callback = _attempt_and_status()
        callback["message"]["order"]["id"] = "another-order"
        response, repository = await self._invoke(attempt, action, callback)
        self.assertEqual(response.status_code, 400)
        repository.update_status_action.assert_not_awaited()

    async def test_cancelled_status_reconciles_pending_cancellation(self):
        attempt, action, callback = _cancelled_status()
        response, repository = await self._invoke(attempt, action, callback)
        self.assertEqual(response["message"]["ack"]["status"], "ACK")
        repository.update_cancel.assert_awaited_once()
        kwargs = repository.update_cancel.await_args.kwargs
        self.assertEqual(kwargs["state"], "CANCELLED")
        self.assertEqual(kwargs["source"], "ON_STATUS")
        self.assertEqual(kwargs["response"], callback)

    async def test_cancelled_status_rejects_wrong_reason(self):
        attempt, action, callback = _cancelled_status()
        callback["message"]["order"]["cancellation"]["reason"]["descriptor"]["short_desc"] = "Different reason"
        response, repository = await self._invoke(attempt, action, callback)
        self.assertEqual(response.status_code, 400)
        repository.update_cancel.assert_not_awaited()

    async def test_stale_confirmed_status_does_not_reverse_cancelled_booking(self):
        attempt, action, callback = _attempt_and_status()
        attempt.update({
            "state": "CANCELLED",
            "confirmState": "CONFIRMED",
            "cancelState": "CANCELLED",
            "cancelReason": "Plans changed",
        })
        response, repository = await self._invoke(attempt, action, callback)
        self.assertEqual(response["message"]["ack"]["status"], "ACK")
        repository.update_confirm.assert_not_awaited()
        repository.update_cancel.assert_not_awaited()
        repository.update_latest_status.assert_not_awaited()

    async def test_rejects_status_with_wrong_quantity_or_currency(self):
        for mutate in (
            lambda order: order["items"][0]["quantity"]["selected"].update({"count": 2}),
            lambda order: order["quote"]["price"].update({"currency": "USD"}),
        ):
            attempt, action, callback = _attempt_and_status()
            mutate(callback["message"]["order"])
            response, repository = await self._invoke(attempt, action, callback)
            self.assertEqual(response.status_code, 400)
            repository.update_status_action.assert_not_awaited()

    async def test_status_duplicates_are_idempotent_and_conflicts_are_rejected(self):
        attempt, action, callback = _attempt_and_status()
        action.update({"state": "STATUS_RECEIVED", "response": callback})
        response, repository = await self._invoke(attempt, action, callback)
        self.assertEqual(response["message"]["ack"]["status"], "ACK")
        repository.update_status_action.assert_not_awaited()

        conflicting = deepcopy(callback)
        conflicting["message"]["order"]["quote"]["price"]["value"] = "1.00"
        response, repository = await self._invoke(attempt, action, conflicting)
        self.assertEqual(response.status_code, 400)
        repository.update_status_action.assert_not_awaited()

    async def test_stale_initialized_status_cannot_replace_newer_confirmed_booking(self):
        attempt, action, callback = _attempt_and_status()
        attempt["state"] = "CONFIRMED"
        attempt["confirmState"] = "CONFIRMED"
        attempt["confirmSource"] = "ON_CONFIRM"
        callback["message"]["order"]["state"] = "INITIALIZED"
        callback["message"]["order"]["tags"] = deepcopy(attempt["providerOrder"]["tags"])
        response, repository = await self._invoke(attempt, action, callback, latest=False)
        self.assertEqual(response["message"]["ack"]["status"], "ACK")
        repository.update_latest_status.assert_awaited_once()
        repository.update_confirm.assert_not_awaited()

    async def test_late_confirm_callback_after_status_reconciliation_is_accepted(self):
        from app.api import on_confirm
        from test_on_init import _attempt_and_callback as _init_fixture

        attempt, init_callback = _init_fixture()
        initialized = deepcopy(init_callback["message"]["order"])
        confirm_message_id = str(uuid4())
        confirmed = deepcopy(initialized)
        confirmed["state"] = "CONFIRMED"
        confirm_callback = {
            "context": {
                **init_callback["context"],
                "action": "on_confirm",
                "bap_id": settings.bap_id,
                "bap_uri": settings.bap_uri,
                "message_id": confirm_message_id,
            },
            "message": {"order": confirmed},
        }
        attempt.update({
            "kind": "transport",
            "state": "CONFIRMED",
            "initState": "INITIALIZED",
            "providerOrder": initialized,
            "confirmState": "CONFIRMED",
            "confirmSource": "ON_STATUS",
            "confirmMessageId": confirm_message_id,
            "acceptedQuote": initialized["quote"]["price"],
            "confirmedProviderResponse": {
                "context": {**confirm_callback["context"], "action": "on_status"},
                "message": {"order": confirmed},
            },
            "provider": {
                "id": init_callback["context"]["bpp_id"],
                "uri": init_callback["context"]["bpp_uri"],
            },
            "item": {"id": initialized["items"][0]["id"], "provider_id": initialized["provider"]["id"]},
            "requestedQuantity": initialized["items"][0]["quantity"]["selected"]["count"],
        })
        confirmed["tags"].append({
            "descriptor": {"code": "TDE_PRICE_ACCEPTANCE"},
            "list": [
                {"descriptor": {"code": "ACCEPTED"}, "value": "true"},
                {"descriptor": {"code": "CURRENCY"}, "value": confirmed["quote"]["price"]["currency"]},
                {"descriptor": {"code": "AMOUNT"}, "value": confirmed["quote"]["price"]["value"]},
            ],
        })
        attempt["confirmedProviderResponse"]["message"]["order"] = confirmed
        repository = AsyncMock()
        repository.get_for_callback.return_value = attempt
        repository.get_for_user.return_value = attempt
        request = _request(confirm_callback)
        request.scope["path"] = "/api/on_confirm"
        with patch.object(on_confirm, "get_db", return_value=None), patch.object(
            on_confirm, "TransportSelectionRepository", return_value=repository
        ), patch.object(on_confirm, "finish", return_value=True):
            response = await on_confirm.on_confirm(request)
        self.assertEqual(response["message"]["ack"]["status"], "ACK")
        repository.update_confirm.assert_awaited_once()

    async def test_lost_on_confirm_is_reconciled_from_provider_store_without_second_deduction(self):
        data = json.loads((ROOT / "mock_providers" / "mock_bus" / "data.json").read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as state_dir, patch.dict(
            os.environ, {"MOCK_PROVIDER_STATE_DIR": state_dir}
        ):
            selection, init_callback = _attempt_and_callback()
            transaction_id = selection["transactionId"]
            initialized = init_callback["message"]["order"]
            provider_id = data["provider"]["bpp_id"]
            save_initialized_order(
                provider_id,
                transaction_id,
                init_callback["context"]["message_id"],
                initialized,
                settings.bap_id,
            )
            confirm_message_id = str(uuid4())
            confirm_request = build_confirm(
                transaction_id=transaction_id,
                message_id=confirm_message_id,
                provider=selection["provider"],
                order=initialized,
                accepted_quote=initialized["quote"]["price"],
            )
            confirm_callback = build_on_confirm(
                with_current_inventory(data, provider_id, "transport", confirm_request),
                confirm_request,
                "transport",
            )
            self.assertNotIn("error", confirm_callback)
            confirmed_order = confirm_callback["message"]["order"]
            service_id = initialized["items"][0]["id"]
            service = next(entry for entry in data["services"] if entry["service_id"] == service_id)
            travel_date = date.fromisoformat(
                initialized["fulfillments"][0]["stops"][0]["time"]["timestamp"][:10]
            )
            inventory_id = inventory_key("transport", service_id, travel_date)
            remaining = get_inventory_available(provider_id, inventory_id, service["seats_available"])
            self.assertEqual(remaining, service["seats_available"] - 1)

            status_message_id = str(uuid4())
            status_request = build_status(
                transaction_id=transaction_id,
                message_id=status_message_id,
                provider=selection["provider"],
                order_id=confirmed_order["id"],
            )
            status_callback = build_on_status(data, status_request)
            selection.update({
                "kind": "transport",
                "state": "PENDING_PROVIDER",
                "initState": "INITIALIZED",
                "providerOrder": initialized,
                "acceptedQuote": initialized["quote"]["price"],
                "confirmState": "PENDING_PROVIDER",
                "confirmMessageId": confirm_message_id,
                "latestStatusMessageId": status_message_id,
            })
            attempt = {
                **selection,
            }
            action = {
                "transactionId": transaction_id,
                "messageId": status_message_id,
                "selectionId": attempt["selectionId"],
                "userId": attempt["userId"],
                "providerId": provider_id,
                "orderId": confirmed_order["id"],
                "state": "PENDING_PROVIDER",
            }
            repository = AsyncMock()
            repository.get_status_for_callback.return_value = (attempt, action)
            repository.update_status_action.return_value = {
                **action,
                "state": "STATUS_RECEIVED",
                "response": status_callback,
            }
            repository.update_latest_status.return_value = attempt
            repository.update_confirm.return_value = {
                **attempt,
                "state": "CONFIRMED",
                "confirmState": "CONFIRMED",
            }
            with patch.object(callback_module, "get_db", return_value=None), patch.object(
                callback_module, "TransportSelectionRepository", return_value=repository
            ), patch.object(callback_module, "finish", return_value=True):
                response = await callback_module.on_status(_request(status_callback))

            self.assertEqual(response["message"]["ack"]["status"], "ACK")
            repository.update_confirm.assert_awaited_once()
            self.assertEqual(
                repository.update_confirm.await_args.kwargs["response"]["message"]["order"]["id"],
                confirmed_order["id"],
            )
            self.assertEqual(get_order(provider_id, confirmed_order["id"]), confirmed_order)
            self.assertEqual(get_inventory_available(provider_id, inventory_id, service["seats_available"]), remaining)


class StatusRequestTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_provider_order_reference_is_reported_without_dispatch(self):
        attempt, _, _ = _attempt_and_status()
        attempt["providerOrder"] = {}
        repository = AsyncMock()
        repository.get_for_user.return_value = attempt
        request = Mock()
        with patch("app.services.booking_status.get_db", return_value=None), patch(
            "app.services.booking_status.TransportSelectionRepository", return_value=repository
        ):
            from fastapi import HTTPException

            with self.assertRaises(HTTPException) as error:
                await refresh_booking_status(
                    selection_id=attempt["selectionId"],
                    request=request,
                    user={"_id": attempt["userId"]},
                    kind="transport",
                )
        self.assertEqual(error.exception.status_code, 409)
        self.assertIn("order reference", error.exception.detail)
        repository.begin_status.assert_not_awaited()

    async def test_status_is_user_scoped_and_not_dispatched_for_another_user(self):
        repository = AsyncMock()
        repository.get_for_user.return_value = None
        request = _request({})
        with patch("app.services.booking_status.get_db", return_value=None), patch(
            "app.services.booking_status.TransportSelectionRepository", return_value=repository
        ):
            from fastapi import HTTPException

            with self.assertRaises(HTTPException) as error:
                await refresh_booking_status(
                    selection_id="selection-1",
                    request=request,
                    user={"_id": "different-user"},
                    kind="transport",
                )
        self.assertEqual(error.exception.status_code, 404)
        repository.begin_status.assert_not_awaited()

    async def test_browser_status_write_requires_csrf_before_backend_dispatch(self):
        from fastapi import HTTPException

        with patch.object(selection_module.settings, "trusted_origins", "http://localhost:3000"), patch.object(
            selection_module, "refresh_booking_status", new=AsyncMock()
        ) as refresh:
            with self.assertRaises(HTTPException) as error:
                await selection_module.refresh_transport_status(
                    "selection-1",
                    _request({}),
                    {"_id": "user-1"},
                )
        self.assertEqual(error.exception.status_code, 403)
        refresh.assert_not_awaited()

    async def test_status_is_persisted_before_signed_direct_dispatch_and_correlated(self):
        attempt, _, provider_callback = _attempt_and_status()
        attempt["latestProviderStatus"] = provider_callback
        message_id = str(uuid4())
        action = {
            "transactionId": attempt["transactionId"],
            "messageId": message_id,
            "selectionId": attempt["selectionId"],
            "userId": attempt["userId"],
            "providerId": attempt["provider"]["id"],
            "orderId": attempt["providerOrder"]["id"],
            "state": "STATUS_REQUESTED",
        }
        repository = AsyncMock()
        repository.get_for_user.return_value = attempt
        repository.begin_status.return_value = action
        repository.claim_status_dispatch.return_value = action
        repository.get_status_action.return_value = {**action, "state": "STATUS_RECEIVED"}
        request = _request({})
        request.app.state.http_client = Mock()
        request.app.state.beckn_identity.address.return_value = attempt["provider"]["uri"]

        def completed_callback(transaction_id, callback_message_id):
            callback = deepcopy(provider_callback)
            callback["context"]["transaction_id"] = transaction_id
            callback["context"]["message_id"] = callback_message_id
            future = asyncio.get_running_loop().create_future()
            future.set_result(callback)
            return future

        with patch("app.services.booking_status.get_db", return_value=None), patch(
            "app.services.booking_status.TransportSelectionRepository", return_value=repository
        ), patch("app.services.booking_status.uuid.uuid4", return_value=message_id), patch(
            "app.services.booking_status.start", side_effect=completed_callback
        ), patch(
            "app.services.booking_status.signed_post",
            new=AsyncMock(return_value=httpx.Response(200, json=ack())),
        ) as send:
            result = await refresh_booking_status(
                selection_id=attempt["selectionId"],
                request=request,
                user={"_id": attempt["userId"]},
                kind="transport",
            )

        repository.begin_status.assert_awaited_once()
        repository.claim_status_dispatch.assert_awaited_once_with(attempt["transactionId"], message_id)
        self.assertEqual(send.await_args.args[1], attempt["provider"]["uri"] + "/status")
        message = send.await_args.args[2]
        self.assertEqual(message["context"]["transaction_id"], attempt["transactionId"])
        self.assertEqual(message["context"]["message_id"], message_id)
        self.assertEqual(message["message"]["order_id"], attempt["providerOrder"]["id"])
        self.assertEqual(result["status_state"], "STATUS_RECEIVED")
        self.assertEqual(result["status_response"]["context"]["message_id"], message_id)

    async def test_status_timeout_remains_pending_and_does_not_redispatch(self):
        attempt, _, _ = _attempt_and_status()
        action = {
            "transactionId": attempt["transactionId"],
            "messageId": str(uuid4()),
            "selectionId": attempt["selectionId"],
            "userId": attempt["userId"],
            "providerId": attempt["provider"]["id"],
            "orderId": attempt["providerOrder"]["id"],
            "state": "STATUS_REQUESTED",
        }
        repository = AsyncMock()
        repository.get_for_user.return_value = attempt
        repository.begin_status.return_value = action
        repository.claim_status_dispatch.return_value = action
        request = _request({})
        request.app.state.http_client = Mock()
        request.app.state.beckn_identity.address.return_value = attempt["provider"]["uri"]
        never = asyncio.get_running_loop().create_future()
        with patch("app.services.booking_status.get_db", return_value=None), patch(
            "app.services.booking_status.TransportSelectionRepository", return_value=repository
        ), patch("app.services.booking_status.start", return_value=never), patch(
            "app.services.booking_status.signed_post",
            new=AsyncMock(return_value=httpx.Response(200, json=ack())),
        ) as send, patch("app.services.booking_status.settings.search_timeout_seconds", 0.001):
            result = await refresh_booking_status(
                selection_id=attempt["selectionId"],
                request=request,
                user={"_id": attempt["userId"]},
                kind="transport",
            )
        self.assertEqual(result["status_state"], "PENDING_PROVIDER")
        self.assertEqual(result["status_message"], "Provider status is pending or unknown; the booking outcome was not changed.")
        repository.update_status_action.assert_awaited_once()
        self.assertEqual(repository.update_status_action.await_args.kwargs["state"], "PENDING_PROVIDER")
        self.assertEqual(send.await_count, 1)
