from pydantic import BaseModel, Field


class SaveItineraryRequest(BaseModel):
    transaction_id: str = Field(min_length=1)
    offer_id: str = Field(min_length=1)


class ItineraryResponse(BaseModel):
    id: str
    transport: dict
    query: dict
    price_status: str
    created_at: str
    updated_at: str
