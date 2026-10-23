import asyncio
import time
from dataclasses import dataclass, field


@dataclass
class SearchSession:
    started_at: float = field(default_factory=time.monotonic)
    responses: list[dict] = field(default_factory=list)


_sessions: dict[str, SearchSession] = {}


def start_session(transaction_id: str) -> None:
    _sessions[transaction_id] = SearchSession()


def add_response(transaction_id: str, payload: dict) -> bool:
    session = _sessions.get(transaction_id)
    if session is None:
        return False
    session.responses.append(payload)
    return True


def end_session(transaction_id: str) -> list[dict]:
    session = _sessions.pop(transaction_id, None)
    return session.responses if session else []


async def collect(transaction_id: str, window_seconds: float) -> list[dict]:
    session = _sessions.get(transaction_id)
    if session:
        elapsed = time.monotonic() - session.started_at
        await asyncio.sleep(max(0, window_seconds - elapsed))
    return end_session(transaction_id)