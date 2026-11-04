from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from app.core.config import settings
from app.repositories.sessions import SessionRepository
from app.repositories.itineraries import ItineraryRepository
from app.repositories.transport_snapshots import TransportSnapshotRepository
from app.repositories.transport_selections import TransportSelectionRepository
from app.repositories.trips import TripRepository
from app.repositories.users import UserRepository

_client: AsyncMongoClient | None = None

def connect_to_mongo() -> None:
    global _client
    _client = AsyncMongoClient(settings.mongo_url)


async def close_mongo() -> None:
    if _client:
        await _client.close()


def get_db() -> AsyncDatabase:
    return _client[settings.db_name]


async def initialize_indexes() -> None:
    database = get_db()
    await UserRepository(database).ensure_indexes()
    await TransportSnapshotRepository(
        database,
        settings.transport_snapshot_ttl_seconds,
    ).ensure_indexes()
    await SessionRepository(
        database,
        settings.session_lifetime_seconds,
    ).ensure_indexes()
    await ItineraryRepository(database).ensure_indexes()
    await TransportSelectionRepository(database).ensure_indexes()
    await TripRepository(database).ensure_indexes()
