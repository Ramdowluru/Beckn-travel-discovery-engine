import asyncio
import time
from dataclasses import dataclass, field
from protocol.contracts import ProtocolError, validate_message


@dataclass
class SearchSession:
    started_at: float = field(default_factory=time.monotonic)
    responses: list[dict] = field(default_factory=list)
    expected_provider_ids: set[str] = field(default_factory=set)
    request_context: dict | None = None
    received_ids: set[tuple[str, str]] = field(default_factory=set)
    complete: asyncio.Event = field(default_factory=asyncio.Event)


@dataclass(frozen=True)
class ProviderSummary:
    expected: int
    responded: int

    @property
    def partial(self) -> bool:
        return self.expected > self.responded


_sessions: dict[str, SearchSession] = {}


def start_session(transaction_id: str, request_context: dict | None = None) -> None:
    _sessions[transaction_id] = SearchSession(request_context=dict(request_context) if request_context else None)


def set_expected_provider_ids(transaction_id: str, provider_ids: list[str]) -> None:
    session = _sessions.get(transaction_id)
    if session is not None:
        session.expected_provider_ids.update(
            provider_id.strip()
            for provider_id in provider_ids
            if isinstance(provider_id, str) and provider_id.strip()
        )
        if session.expected_provider_ids and session.expected_provider_ids <= distinct_response_provider_ids(session.responses):
            session.complete.set()


def expected_provider_ids(transaction_id: str) -> set[str]:
    session = _sessions.get(transaction_id)
    return set(session.expected_provider_ids) if session else set()


def session_elapsed(transaction_id: str) -> float | None:
    session = _sessions.get(transaction_id)
    return time.monotonic() - session.started_at if session else None


def add_response(transaction_id: str, payload: dict) -> bool:
    session = _sessions.get(transaction_id)
    if session is None:
        return False
    if session.request_context is not None:
        try:
            validate_message(payload, "on_search")
        except (ProtocolError, TypeError, AttributeError):
            return False
        context = payload["context"]
        for key in ("transaction_id", "message_id", "bap_id", "bap_uri", "domain", "version"):
            if context.get(key) != session.request_context.get(key):
                return False
        if session.expected_provider_ids and context["bpp_id"] not in session.expected_provider_ids:
            return False
        identity = (context["bpp_id"], context["message_id"])
        if identity in session.received_ids:
            return False
        session.received_ids.add(identity)
    session.responses.append(payload)
    if session.expected_provider_ids and session.expected_provider_ids <= distinct_response_provider_ids(session.responses):
        session.complete.set()
    return True


def end_session(transaction_id: str) -> list[dict]:
    session = _sessions.pop(transaction_id, None)
    return session.responses if session else []


def distinct_response_provider_ids(responses: list[dict]) -> set[str]:
    provider_ids: set[str] = set()
    for response in responses:
        context = response.get("context")
        provider_id = context.get("bpp_id") if isinstance(context, dict) else None
        if isinstance(provider_id, str) and provider_id.strip():
            provider_ids.add(provider_id.strip())
    return provider_ids


def valid_callbacks(
    responses: list[dict],
    expected_ids: set[str],
) -> list[dict]:
    return [
        response
        for response in responses
        if is_valid_callback(response, expected_ids)
    ]


def is_valid_callback(response: dict, expected_ids: set[str]) -> bool:
    context = response.get("context")
    message = response.get("message")
    if not isinstance(context, dict) or context.get("action") != "on_search":
        return False
    provider_id = context.get("bpp_id")
    if not isinstance(provider_id, str) or not provider_id.strip():
        return False
    if expected_ids and provider_id.strip() not in expected_ids:
        return False
    if not isinstance(message, dict):
        return False
    catalog = message.get("catalog")
    providers = catalog.get("providers") if isinstance(catalog, dict) else None
    return isinstance(providers, list) and all(
        isinstance(provider, dict) for provider in providers
    )


def summarize_providers(
    expected_ids: set[str],
    responses: list[dict],
) -> ProviderSummary:
    responded_ids = distinct_response_provider_ids(valid_callbacks(responses, expected_ids))
    responded_count = len(responded_ids & expected_ids) if expected_ids else len(responded_ids)
    return ProviderSummary(len(expected_ids), responded_count)


async def collect(transaction_id: str, window_seconds: float) -> list[dict]:
    session = _sessions.get(transaction_id)
    if session:
        elapsed = time.monotonic() - session.started_at
        try:
            await asyncio.wait_for(session.complete.wait(), max(0, window_seconds - elapsed))
        except asyncio.TimeoutError:
            pass
    return end_session(transaction_id)
