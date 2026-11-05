import asyncio


_sessions: dict[tuple[str, str], asyncio.Future] = {}


def start(transaction_id: str, message_id: str) -> asyncio.Future:
    loop = asyncio.get_running_loop()
    future = loop.create_future()
    _sessions[(transaction_id, message_id)] = future
    return future


def finish(transaction_id: str, message_id: str, payload: dict) -> bool:
    future = _sessions.pop((transaction_id, message_id), None)
    if future is None or future.done():
        return False
    future.set_result(payload)
    return True


def discard(transaction_id: str, message_id: str) -> None:
    _sessions.pop((transaction_id, message_id), None)
