from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from app.core.config import settings
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
    await UserRepository(get_db()).ensure_indexes()