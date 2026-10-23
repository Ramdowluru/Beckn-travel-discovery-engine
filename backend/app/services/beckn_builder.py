import uuid
from datetime import datetime,timezone

from app.core.config import settings
from app.schemas.search import SearchQuery

def build_context(transaction_id:str)-> dict:
    return {
        "domain": "TRV",
        "action": "search",
        "bap_id": settings.bap_id,
        "bap_uri": settings.bap_uri,
        "transaction_id": transaction_id,
        "message_id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def build_transport_search(query:SearchQuery,transaction_id:str)->dict:
    fulfillment = {
        "stops": [
            {"type": "START", "location": {"descriptor": {"name": query.origin}}},
            {"type": "END", "location": {"descriptor": {"name": query.destination}}},
        ]
    }

    if query.date:
        fulfillment["start"] = {
            "time": {
                "range": {
                    "start": f"{query.date}T00:00:00Z",
                    "end": f"{query.date}T23:59:59Z",
                }
            }
        }

    return {
        "context": build_context(transaction_id),
        "message": {
            "intent": {
                "fulfillment": fulfillment,
                "tags": [
                    {
                        "descriptor": {"code": "NUM_TRAVELERS"},
                        "list": [
                            {
                                "descriptor": {"code": "COUNT"},
                                "value": str(query.travellers),
                            }
                        ],
                    }
                ],
            }
        },
    }   