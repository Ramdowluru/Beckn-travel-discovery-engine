import uuid
from datetime import datetime, timezone

from app.core.config import settings
from app.schemas.search import SearchQuery
from protocol.contracts import DOMAIN, TTL, VERSION


def build_context(transaction_id: str) -> dict:
    return {
        "domain": DOMAIN,
        "version": VERSION,
        "ttl": TTL,
        "action": "search",
        "bap_id": settings.bap_id,
        "bap_uri": settings.bap_uri,
        "transaction_id": transaction_id,
        "message_id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def build_transport_search(query: SearchQuery, transaction_id: str) -> dict:
    fulfillment = {
        "stops": [
            {"type": "START", "location": {"descriptor": {"name": query.origin}}},
            {"type": "END", "location": {"descriptor": {"name": query.destination}}},
        ]
    }
    if query.date:
        fulfillment["stops"][0]["time"] = {"range": {
            "start": f"{query.date}T00:00:00+05:30",
            "end": f"{query.date}T23:59:59+05:30",
        }}
    return {
        "context": build_context(transaction_id),
        "message": {
            "intent": {
                "fulfillment": fulfillment,
                "tags": [{
                    "descriptor": {"code": "NUM_TRAVELERS"},
                    "list": [{"descriptor": {"code": "COUNT"}, "value": str(query.travellers)}],
                }],
            },
        },
    }


def build_hotel_search(query: SearchQuery, transaction_id: str) -> dict:
    return {
        "context": build_context(transaction_id),
        "message": {
            "intent": {
                "fulfillment": {
                    "type": "STAY",
                    "location": {"descriptor": {"name": query.destination}},
                    "start": {
                        "time": {
                            "range": {"start": f"{query.check_in}T00:00:00+05:30"},
                        },
                    },
                    "end": {
                        "time": {
                            "range": {"end": f"{query.check_out}T00:00:00+05:30"},
                        },
                    },
                },
                "tags": [
                    {
                        "descriptor": {"code": "ROOMS"},
                        "list": [{"descriptor": {"code": "COUNT"}, "value": str(query.rooms)}],
                    },
                    {
                        "descriptor": {"code": "GUESTS"},
                        "list": [{"descriptor": {"code": "COUNT"}, "value": str(query.guests)}],
                    },
                ],
            },
        },
    }


def build_experience_search(query: SearchQuery, transaction_id: str) -> dict:
    experience_date = query.experience_date or query.date
    participants = query.participants or query.travellers
    return {
        "context": build_context(transaction_id),
        "message": {
            "intent": {
                "fulfillment": {
                    "type": "EXPERIENCE",
                    "location": {"descriptor": {"name": query.destination}},
                    "start": {
                        "time": {
                            "range": {
                                "start": f"{experience_date}T00:00:00+05:30",
                                "end": f"{experience_date}T23:59:59+05:30",
                            },
                        },
                    },
                },
                "tags": [{
                    "descriptor": {"code": "NUM_PARTICIPANTS"},
                    "list": [{"descriptor": {"code": "COUNT"}, "value": str(participants)}],
                }],
            },
        },
    }
