import asyncio
import json
import os
import random
import logging
import sqlite3
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pymongo.errors import PyMongoError

from common.beckn_converter import build_on_init, build_on_search, build_on_select
from common.cancellation import build_on_cancel
from common.confirmation import build_on_confirm
from common.inventory import with_current_inventory
from common.order_store import mongo_storage_enabled, save_initialized_order
from common.mongo_order_store import (
    MongoStorageConfigurationError,
    MongoTransactionsUnsupported,
    close_mongo_provider_stores,
    get_mongo_provider_store,
)
from common.status import build_on_status
from mock_hotel.hotel_converter import (
    build_hotel_on_init,
    build_hotel_on_search,
    build_hotel_on_select,
)
from mock_experience.experience_converter import (
    build_experience_on_init,
    build_experience_on_search,
    build_experience_on_select,
)
from protocol.contracts import (
    ProtocolError,
    validate_message,
    ack,
    require_ack,
    prepare_discovery_validation,
    prepare_order_validation,
)
from protocol.signing import Identity, signed_post

logging.basicConfig(level=logging.INFO)


def _storage_error_callback(request: dict, provider: dict, action: str) -> dict:
    return {
        "context": {
            **request["context"],
            "action": "on_" + action,
            "bpp_id": provider["bpp_id"],
            "bpp_uri": provider["bpp_uri"],
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "error": {"code": "30005", "message": "Provider storage is unavailable; the action was not completed."},
    }


_STORAGE_ERRORS = (PyMongoError, MongoStorageConfigurationError, MongoTransactionsUnsupported)


def create_app(provider_dir: Path) -> FastAPI:
    load_dotenv(provider_dir / ".env")
    data = json.loads((provider_dir / "data.json").read_text(encoding="utf-8"))
    if mongo_storage_enabled(data["provider"]["bpp_id"]):
        os.environ["MOCK_PROVIDER_BPP_ID"] = data["provider"]["bpp_id"]
        os.environ["MOCK_PROVIDER_ID"] = data["provider"]["id"]
        store = get_mongo_provider_store()
        store.verify_transactions()
        data = store.load_catalog(data["provider"]["bpp_id"])
        store.ensure_indexes()
    name = data["provider"]["name"]
    delay = float(os.getenv("DELAY_SECONDS", "0.5"))
    fail_rate = float(os.getenv("FAIL_RATE", "0"))

    logger = logging.getLogger(name)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        prepare_discovery_validation()
        prepare_order_validation()
        app.state.http_client = httpx.AsyncClient(timeout=5, trust_env=False)
        app.state.beckn_identity = Identity.load(data["provider"]["bpp_id"])
        try:
            yield
        finally:
            await app.state.http_client.aclose()
            if mongo_storage_enabled(data["provider"]["bpp_id"]):
                close_mongo_provider_stores()

    app = FastAPI(title=name, lifespan=lifespan)

    async def reply(request: dict) -> None:
        await asyncio.sleep(delay)

        if random.random() < fail_rate:
            print(f"[{name}] simulated failure, no reply sent")
            return

        try:
            live_data = with_current_inventory(data, data["provider"]["bpp_id"], "transport", request)
            on_search = build_on_search(live_data, request)
        except _STORAGE_ERRORS as error:
            logger.error("search storage failure transaction_id=%s category=%s",
                         request["context"]["transaction_id"], type(error).__name__)
            on_search = _storage_error_callback(request, data["provider"], "search")
        validate_message(on_search, "on_search")
        url = f"{request['context']['bap_uri']}/api/on_search"
        transaction_id = request.get("context", {}).get("transaction_id")
        started_at = time.monotonic()
        try:
            response = await signed_post(app.state.http_client, url, on_search, app.state.beckn_identity)
            require_ack(response)
            logger.info(
                "callback transaction_id=%s status=%s body=%s elapsed_ms=%.1f",
                transaction_id,
                response.status_code,
                response.text,
                (time.monotonic() - started_at) * 1000,
            )
        except (httpx.RequestError, ProtocolError) as error:
            logger.warning(
                "callback failed transaction_id=%s error=%s elapsed_ms=%.1f",
                transaction_id,
                error,
                (time.monotonic() - started_at) * 1000,
            )

    async def select_reply(request: dict) -> None:
        await asyncio.sleep(delay)
        try:
            live_data = with_current_inventory(data, data["provider"]["bpp_id"], "transport", request)
            callback = build_on_select(live_data, request)
        except _STORAGE_ERRORS as error:
            logger.error("select storage failure transaction_id=%s category=%s",
                         request["context"]["transaction_id"], type(error).__name__)
            callback = _storage_error_callback(request, data["provider"], "select")
        validate_message(callback, "on_select")
        try:
            response = await signed_post(
                app.state.http_client,
                f"{request['context']['bap_uri']}/api/on_select",
                callback,
                app.state.beckn_identity,
            )
            require_ack(response)
            logger.info(
                "on_select callback ACK transaction_id=%s message_id=%s status=%s",
                request["context"]["transaction_id"],
                request["context"]["message_id"],
                response.status_code,
            )
        except (httpx.RequestError, ProtocolError) as error:
            logger.warning(
                "on_select callback failed transaction_id=%s message_id=%s reason=%s",
                request["context"]["transaction_id"],
                request["context"]["message_id"],
                type(error).__name__,
            )

    async def init_reply(request: dict) -> None:
        await asyncio.sleep(delay)
        try:
            live_data = with_current_inventory(data, data["provider"]["bpp_id"], "transport", request)
            callback = build_on_init(live_data, request)
        except _STORAGE_ERRORS as error:
            logger.error("init storage failure transaction_id=%s category=%s",
                         request["context"]["transaction_id"], type(error).__name__)
            callback = _storage_error_callback(request, data["provider"], "init")
        if not callback.get("error"):
            try:
                save_initialized_order(
                    data["provider"]["bpp_id"],
                    request["context"]["transaction_id"],
                    request["context"]["message_id"],
                    callback["message"]["order"],
                    request["context"]["bap_id"],
                )
            except (sqlite3.Error, *_STORAGE_ERRORS) as error:
                logger.error(
                    "provider order persistence failed transaction_id=%s category=%s",
                    request["context"]["transaction_id"],
                    type(error).__name__,
                )
                callback = _storage_error_callback(request, data["provider"], "init")
        validate_message(callback, "on_init")
        try:
            response = await signed_post(
                app.state.http_client,
                f"{request['context']['bap_uri']}/api/on_init",
                callback,
                app.state.beckn_identity,
            )
            require_ack(response)
        except (httpx.RequestError, ProtocolError) as error:
            logger.warning("init callback failed: %s", error)

    async def confirm_reply(request: dict) -> None:
        await asyncio.sleep(delay)
        try:
            live_data = with_current_inventory(data, data["provider"]["bpp_id"], "transport", request)
            callback = build_on_confirm(live_data, request, "transport")
        except _STORAGE_ERRORS as error:
            logger.error("confirm storage failure transaction_id=%s category=%s",
                         request["context"]["transaction_id"], type(error).__name__)
            callback = _storage_error_callback(request, data["provider"], "confirm")
        validate_message(callback, "on_confirm")
        try:
            response = await signed_post(
                app.state.http_client,
                f"{request['context']['bap_uri']}/api/on_confirm",
                callback,
                app.state.beckn_identity,
            )
            require_ack(response)
        except (httpx.RequestError, ProtocolError):
            logger.warning(
                "on_confirm callback failed transaction_id=%s message_id=%s",
                request["context"]["transaction_id"],
                request["context"]["message_id"],
            )

    async def status_reply(request: dict) -> None:
        await asyncio.sleep(delay)
        try:
            callback = build_on_status(data, request)
        except _STORAGE_ERRORS as error:
            logger.error("status storage failure transaction_id=%s category=%s",
                         request["context"]["transaction_id"], type(error).__name__)
            callback = _storage_error_callback(request, data["provider"], "status")
        validate_message(callback, "on_status")
        try:
            response = await signed_post(
                app.state.http_client,
                f"{request['context']['bap_uri']}/api/on_status",
                callback,
                app.state.beckn_identity,
            )
            require_ack(response)
        except (httpx.RequestError, ProtocolError):
            logger.warning(
                "on_status callback delivery failed transaction_id=%s message_id=%s",
                request["context"]["transaction_id"],
                request["context"]["message_id"],
            )

    async def cancel_reply(request: dict) -> None:
        await asyncio.sleep(delay)
        try:
            callback = build_on_cancel(data, request, "transport")
        except _STORAGE_ERRORS as error:
            logger.error("cancel storage failure transaction_id=%s category=%s",
                         request["context"]["transaction_id"], type(error).__name__)
            callback = _storage_error_callback(request, data["provider"], "cancel")
        validate_message(callback, "on_cancel")
        try:
            response = await signed_post(
                app.state.http_client,
                f"{request['context']['bap_uri']}/api/on_cancel",
                callback,
                app.state.beckn_identity,
            )
            require_ack(response)
        except (httpx.RequestError, ProtocolError):
            logger.warning(
                "on_cancel callback failed transaction_id=%s message_id=%s",
                request["context"]["transaction_id"],
                request["context"]["message_id"],
            )

    @app.post("/search")
    async def search(request: Request, background_tasks: BackgroundTasks):
        try:
            raw_body = await request.body()
            payload = json.loads(raw_body)
            validate_message(payload, "search")
            identity = app.state.beckn_identity
            identity.verify(raw_body, request.headers, payload["context"]["bap_id"])
            identity.check_address(payload["context"]["bap_id"], payload["context"]["bap_uri"])
            gateway_authorization = request.headers.get("x-gateway-authorization")
            if gateway_authorization:
                identity.verify(
                    raw_body,
                    {"Authorization": gateway_authorization},
                    "mock-gateway.example.in",
                )
        except (ProtocolError, ValueError, TypeError, AttributeError, KeyError):
            return JSONResponse(ack("Invalid or unauthenticated search"), status_code=400)
        background_tasks.add_task(reply, payload)
        return ack()

    @app.post("/select")
    async def select(request: Request, background_tasks: BackgroundTasks):
        try:
            raw_body = await request.body()
            payload = json.loads(raw_body)
            validate_message(payload, "select")
            identity = app.state.beckn_identity
            identity.verify(raw_body, request.headers, payload["context"]["bap_id"])
            identity.check_address(payload["context"]["bap_id"], payload["context"]["bap_uri"])
            if (
                payload["context"].get("bpp_id") != data["provider"]["bpp_id"]
                or payload["context"].get("bpp_uri") != data["provider"]["bpp_uri"]
            ):
                raise ProtocolError("Request is addressed to a different provider.")
            gateway_authorization = request.headers.get("x-gateway-authorization")
            if gateway_authorization:
                identity.verify(raw_body, {"Authorization": gateway_authorization}, "mock-gateway.example.in")
        except (ProtocolError, ValueError, TypeError, AttributeError, KeyError):
            return JSONResponse(ack("Invalid or unauthenticated select"), status_code=400)
        logger.info(
            "select accepted transaction_id=%s message_id=%s",
            payload["context"]["transaction_id"],
            payload["context"]["message_id"],
        )
        background_tasks.add_task(select_reply, payload)
        return ack()

    @app.post("/init")
    async def init(request: Request, background_tasks: BackgroundTasks):
        try:
            raw_body = await request.body()
            payload = json.loads(raw_body)
            validate_message(payload, "init")
            identity = app.state.beckn_identity
            identity.verify(raw_body, request.headers, payload["context"]["bap_id"])
            identity.check_address(payload["context"]["bap_id"], payload["context"]["bap_uri"])
            if (
                payload["context"].get("bpp_id") != data["provider"]["bpp_id"]
                or payload["context"].get("bpp_uri") != data["provider"]["bpp_uri"]
            ):
                raise ProtocolError("Request is addressed to a different provider.")
        except (ProtocolError, ValueError, TypeError, AttributeError, KeyError):
            return JSONResponse(ack("Invalid or unauthenticated init"), status_code=400)
        background_tasks.add_task(init_reply, payload)
        return ack()

    @app.post("/confirm")
    async def confirm(request: Request, background_tasks: BackgroundTasks):
        try:
            raw_body = await request.body()
            payload = json.loads(raw_body)
            validate_message(payload, "confirm")
            identity = app.state.beckn_identity
            identity.verify(raw_body, request.headers, payload["context"]["bap_id"])
            identity.check_address(payload["context"]["bap_id"], payload["context"]["bap_uri"])
            if (
                payload["context"].get("bpp_id") != data["provider"]["bpp_id"]
                or payload["context"].get("bpp_uri") != data["provider"]["bpp_uri"]
            ):
                raise ProtocolError("Request is addressed to a different provider.")
        except (ProtocolError, ValueError, TypeError, AttributeError, KeyError):
            return JSONResponse(ack("Invalid or unauthenticated confirm"), status_code=400)
        background_tasks.add_task(confirm_reply, payload)
        return ack()

    @app.post("/status")
    async def status(request: Request, background_tasks: BackgroundTasks):
        try:
            raw_body = await request.body()
            payload = json.loads(raw_body)
            validate_message(payload, "status")
            identity = app.state.beckn_identity
            identity.verify(raw_body, request.headers, payload["context"]["bap_id"])
            identity.check_address(payload["context"]["bap_id"], payload["context"]["bap_uri"])
            if (
                payload["context"].get("bpp_id") != data["provider"]["bpp_id"]
                or payload["context"].get("bpp_uri") != data["provider"]["bpp_uri"]
            ):
                raise ProtocolError("Request is addressed to a different provider.")
        except (ProtocolError, ValueError, TypeError, AttributeError, KeyError):
            return JSONResponse(ack("Invalid or unauthenticated status"), status_code=400)
        background_tasks.add_task(status_reply, payload)
        return ack()

    @app.post("/cancel")
    async def cancel(request: Request, background_tasks: BackgroundTasks):
        try:
            raw_body = await request.body()
            payload = json.loads(raw_body)
            validate_message(payload, "cancel")
            identity = app.state.beckn_identity
            identity.verify(raw_body, request.headers, payload["context"]["bap_id"])
            identity.check_address(payload["context"]["bap_id"], payload["context"]["bap_uri"])
            if (
                payload["context"].get("bpp_id") != data["provider"]["bpp_id"]
                or payload["context"].get("bpp_uri") != data["provider"]["bpp_uri"]
            ):
                raise ProtocolError("Request is addressed to a different provider.")
        except (ProtocolError, ValueError, TypeError, AttributeError, KeyError):
            return JSONResponse(ack("Invalid or unauthenticated cancel"), status_code=400)
        background_tasks.add_task(cancel_reply, payload)
        return ack()

    return app


def create_hotel_app(provider_dir: Path) -> FastAPI:
    load_dotenv(provider_dir / ".env")
    data = json.loads((provider_dir / "data.json").read_text(encoding="utf-8"))
    if mongo_storage_enabled(data["provider"]["bpp_id"]):
        os.environ["MOCK_PROVIDER_BPP_ID"] = data["provider"]["bpp_id"]
        os.environ["MOCK_PROVIDER_ID"] = data["provider"]["id"]
        store = get_mongo_provider_store()
        store.verify_transactions()
        # Keep the nested hotel catalog required by the converter; Mongo remains
        # authoritative for inventory and orders through with_current_inventory.
        store.load_catalog(data["provider"]["bpp_id"])
        store.ensure_indexes()
    name = data["provider"]["name"]
    delay = float(os.getenv("DELAY_SECONDS", "0.5"))
    fail_rate = float(os.getenv("FAIL_RATE", "0"))
    logger = logging.getLogger(name)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        prepare_discovery_validation()
        prepare_order_validation()
        app.state.http_client = httpx.AsyncClient(timeout=5, trust_env=False)
        app.state.beckn_identity = Identity.load(data["provider"]["bpp_id"])
        yield
        await app.state.http_client.aclose()

    app = FastAPI(title=name, lifespan=lifespan)
    _register_category_booking_routes(app, data, build_hotel_on_select, build_hotel_on_init)

    async def reply(request: dict) -> None:
        await asyncio.sleep(delay)
        if random.random() < fail_rate:
            logger.warning("simulated failure, no reply sent")
            return
        live_data = with_current_inventory(data, data["provider"]["bpp_id"], "hotel", request)
        callback = build_hotel_on_search(live_data, request)
        validate_message(callback, "on_search")
        callback_url = f"{request['context']['bap_uri']}/api/on_search"
        transaction_id = request.get("context", {}).get("transaction_id")
        started_at = time.monotonic()
        try:
            response = await signed_post(
                app.state.http_client,
                callback_url,
                callback,
                app.state.beckn_identity,
            )
            require_ack(response)
            logger.info(
                "hotel callback transaction_id=%s status=%s elapsed_ms=%.1f",
                transaction_id,
                response.status_code,
                (time.monotonic() - started_at) * 1000,
            )
        except (httpx.RequestError, ProtocolError) as error:
            logger.warning(
                "hotel callback failed transaction_id=%s reason=%s",
                transaction_id,
                type(error).__name__,
            )

    @app.post("/search")
    async def search(request: Request):
        try:
            raw_body = await request.body()
            payload = json.loads(raw_body)
            validate_message(payload, "search")
            identity = app.state.beckn_identity
            identity.verify(raw_body, request.headers, payload["context"]["bap_id"])
            identity.check_address(payload["context"]["bap_id"], payload["context"]["bap_uri"])
            gateway_authorization = request.headers.get("x-gateway-authorization")
            if gateway_authorization:
                identity.verify(
                    raw_body,
                    {"Authorization": gateway_authorization},
                    "mock-gateway.example.in",
                )
        except (ProtocolError, ValueError, TypeError, AttributeError, KeyError):
            return JSONResponse(ack("Invalid or unauthenticated search"), status_code=400)
        asyncio.create_task(reply(payload))
        return ack()

    return app


def create_experience_app(provider_dir: Path) -> FastAPI:
    load_dotenv(provider_dir / ".env")
    data = json.loads((provider_dir / "data.json").read_text(encoding="utf-8"))
    name = data["provider"]["name"]
    delay = float(os.getenv("DELAY_SECONDS", "0.5"))
    fail_rate = float(os.getenv("FAIL_RATE", "0"))
    logger = logging.getLogger(name)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        prepare_discovery_validation()
        prepare_order_validation()
        app.state.http_client = httpx.AsyncClient(timeout=5, trust_env=False)
        app.state.beckn_identity = Identity.load(data["provider"]["bpp_id"])
        yield
        await app.state.http_client.aclose()

    app = FastAPI(title=name, lifespan=lifespan)
    _register_category_booking_routes(app, data, build_experience_on_select, build_experience_on_init)

    async def reply(request: dict) -> None:
        await asyncio.sleep(delay)
        if random.random() < fail_rate:
            logger.warning("simulated failure, no reply sent")
            return
        live_data = with_current_inventory(data, data["provider"]["bpp_id"], "experience", request)
        callback = build_experience_on_search(live_data, request)
        validate_message(callback, "on_search")
        try:
            response = await signed_post(
                app.state.http_client,
                f"{request['context']['bap_uri']}/api/on_search",
                callback,
                app.state.beckn_identity,
            )
            require_ack(response)
        except (httpx.RequestError, ProtocolError) as error:
            logger.warning("experience callback failed: %s", error)

    @app.post("/search")
    async def search(request: Request, background_tasks: BackgroundTasks):
        try:
            raw_body = await request.body()
            payload = json.loads(raw_body)
            validate_message(payload, "search")
            identity = app.state.beckn_identity
            identity.verify(raw_body, request.headers, payload["context"]["bap_id"])
            identity.check_address(payload["context"]["bap_id"], payload["context"]["bap_uri"])
            gateway_authorization = request.headers.get("x-gateway-authorization")
            if gateway_authorization:
                identity.verify(raw_body, {"Authorization": gateway_authorization}, "mock-gateway.example.in")
        except (ProtocolError, ValueError, TypeError, AttributeError, KeyError):
            return JSONResponse(ack("Invalid or unauthenticated search"), status_code=400)
        background_tasks.add_task(reply, payload)
        return ack()

    return app


def _register_category_booking_routes(app: FastAPI, data: dict, select_builder, init_builder) -> None:
    provider_id = data["provider"]["bpp_id"]
    logger = logging.getLogger(data["provider"]["name"])
    category = "hotel" if select_builder is build_hotel_on_select else "experience"

    async def send_callback(action: str, payload: dict) -> None:
        live_data = data if action in {"status", "cancel"} else with_current_inventory(data, provider_id, category, payload)
        if action == "select":
            callback = select_builder(live_data, payload)
        elif action == "init":
            callback = init_builder(live_data, payload)
        elif action == "status":
            callback = build_on_status(live_data, payload)
        elif action == "cancel":
            callback = build_on_cancel(live_data, payload, category)
        else:
            callback = build_on_confirm(live_data, payload, category)
        callback_action = "on_" + action
        validate_message(callback, callback_action)
        if action == "init" and not callback.get("error"):
            try:
                save_initialized_order(
                    provider_id,
                    payload["context"]["transaction_id"],
                    payload["context"]["message_id"],
                    callback["message"]["order"],
                    payload["context"]["bap_id"],
                )
            except sqlite3.Error:
                logger.error("provider order persistence failed action=init")
                callback = {
                    "context": callback["context"],
                    "error": {"code": "30005", "message": "Provider could not save the initialized order."},
                }
                validate_message(callback, "on_init")
        try:
            response = await signed_post(
                app.state.http_client,
                f"{payload['context']['bap_uri']}/api/{callback_action}",
                callback,
                app.state.beckn_identity,
            )
            require_ack(response)
        except (httpx.RequestError, ProtocolError):
            logger.warning(
                "provider callback delivery failed action=%s transaction_id=%s message_id=%s",
                callback_action,
                payload["context"]["transaction_id"],
                payload["context"]["message_id"],
            )

    async def receive_action(action: str, request: Request, background_tasks: BackgroundTasks):
        try:
            body = await request.body()
            payload = json.loads(body)
            validate_message(payload, action)
            identity = app.state.beckn_identity
            identity.verify(body, request.headers, payload["context"]["bap_id"])
            identity.check_address(payload["context"]["bap_id"], payload["context"]["bap_uri"])
            if (
                payload["context"].get("bpp_id") != provider_id
                or payload["context"].get("bpp_uri") != data["provider"]["bpp_uri"]
            ):
                raise ProtocolError("Request is addressed to a different provider.")
        except (ProtocolError, ValueError, TypeError, AttributeError, KeyError):
            return JSONResponse(ack(f"Invalid or unauthenticated {action}"), status_code=400)
        background_tasks.add_task(send_callback, action, payload)
        return ack()

    @app.post("/select")
    async def select(request: Request, background_tasks: BackgroundTasks):
        return await receive_action("select", request, background_tasks)

    @app.post("/init")
    async def init(request: Request, background_tasks: BackgroundTasks):
        return await receive_action("init", request, background_tasks)

    @app.post("/confirm")
    async def confirm(request: Request, background_tasks: BackgroundTasks):
        return await receive_action("confirm", request, background_tasks)

    @app.post("/status")
    async def status(request: Request, background_tasks: BackgroundTasks):
        return await receive_action("status", request, background_tasks)

    @app.post("/cancel")
    async def cancel(request: Request, background_tasks: BackgroundTasks):
        return await receive_action("cancel", request, background_tasks)
