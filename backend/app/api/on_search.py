from fastapi import APIRouter

from app.services.search_session import add_response

router = APIRouter(prefix="/api")

@router.post("/on_search")
async def on_search(payload:dict):
    transaction_id = payload.get("context",{}).get("transaction_id")
    accepted = add_response(transaction_id,payload)
    status = "ACK" if accepted else "NACK"

    return {"message":{"ack":{"status":status}}}