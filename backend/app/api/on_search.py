import logging
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from protocol.contracts import ProtocolError, ack, validate_message
import json

from app.services.search_session import add_response, session_elapsed

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

@router.post("/on_search")
async def on_search(request: Request):
    received_at = time.monotonic()
    try:
        body = await request.body()
        payload = json.loads(body)
        validate_message(payload, "on_search")
        identity = request.app.state.beckn_identity
        identity.verify(body, request.headers, payload["context"]["bpp_id"])
        identity.check_address(payload["context"]["bpp_id"], payload["context"]["bpp_uri"])
    except (ProtocolError, ValueError, TypeError, AttributeError, KeyError):
        return JSONResponse(ack("Invalid, untrusted or expired callback"), status_code=400)
    transaction_id = payload["context"]["transaction_id"]
    accepted = add_response(transaction_id,payload)
    status = "ACK" if accepted else "NACK"
    elapsed = session_elapsed(transaction_id)
    body = ack(None if accepted else "Unknown, mismatched, duplicate or closed request cycle")
    logger.info(
        "callback %s transaction_id=%s elapsed_ms=%s body=%s",
        "accepted" if accepted else "rejected",
        transaction_id,
        f"{elapsed * 1000:.1f}" if elapsed is not None else "late",
        body,
    )

    return body
