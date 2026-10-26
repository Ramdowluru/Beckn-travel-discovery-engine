import logging
import time

from fastapi import APIRouter

from app.services.search_session import add_response, session_elapsed

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

@router.post("/on_search")
async def on_search(payload:dict):
    received_at = time.monotonic()
    transaction_id = payload.get("context",{}).get("transaction_id")
    accepted = add_response(transaction_id,payload)
    status = "ACK" if accepted else "NACK"
    elapsed = session_elapsed(transaction_id)
    body = {"message":{"ack":{"status":status}}}
    logger.info(
        "callback %s transaction_id=%s elapsed_ms=%s body=%s",
        "accepted" if accepted else "rejected",
        transaction_id,
        f"{elapsed * 1000:.1f}" if elapsed is not None else "late",
        body,
    )

    return body