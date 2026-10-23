from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.database import close_mongo, connect_to_mongo, get_db, initialize_indexes


@asynccontextmanager
async def lifespan(app: FastAPI):
    connect_to_mongo()
    await initialize_indexes()
    yield
    await close_mongo()

app = FastAPI(title="Travel Discovery BAP",lifespan=lifespan)


from app.api.search import router as search_router
app.include_router(search_router)

from app.api.on_search import router as on_search_router
app.include_router(on_search_router)

from app.api.auth import router as auth_router
app.include_router(auth_router)


@app.get("/health")
async def health():
    await get_db().command("ping")
    return {"status":"ok","database":"connected"}
