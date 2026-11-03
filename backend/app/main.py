from contextlib import asynccontextmanager

import httpx
import logging
from fastapi import FastAPI

from app.core.database import close_mongo, connect_to_mongo, get_db, initialize_indexes
from app.core.config import settings
from protocol.signing import Identity
from protocol.contracts import prepare_discovery_validation, prepare_order_validation

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    prepare_discovery_validation()
    prepare_order_validation()
    connect_to_mongo()
    await initialize_indexes()
    app.state.http_client = httpx.AsyncClient(timeout=5, trust_env=False)
    app.state.beckn_identity = Identity.load(settings.bap_id)
    yield
    await app.state.http_client.aclose()
    await close_mongo()

app = FastAPI(title="Travel Discovery BAP",lifespan=lifespan)


from app.api.search import router as search_router
app.include_router(search_router)

from app.api.on_search import router as on_search_router
app.include_router(on_search_router)
from app.api.on_select import router as on_select_router
app.include_router(on_select_router)
from app.api.on_init import router as on_init_router
app.include_router(on_init_router)
from app.api.on_confirm import router as on_confirm_router
app.include_router(on_confirm_router)
from app.api.on_status import router as on_status_router
app.include_router(on_status_router)
from app.api.on_cancel import router as on_cancel_router
app.include_router(on_cancel_router)
from app.api.selection import router as selection_router
app.include_router(selection_router)

from app.api.category_booking import router as category_booking_router
app.include_router(category_booking_router)

from app.api.transport import router as transport_router
app.include_router(transport_router)

from app.api.itineraries import router as itineraries_router
app.include_router(itineraries_router)

from app.api.bookings import router as bookings_router
app.include_router(bookings_router)

from app.api.auth import router as auth_router
app.include_router(auth_router)


@app.get("/health")
async def health():
    await get_db().command("ping")
    return {"status":"ok","database":"connected"}
