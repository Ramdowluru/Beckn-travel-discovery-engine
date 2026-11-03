from pydantic import BaseModel, EmailStr, Field, field_validator


class TravellerDetails(BaseModel):
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Traveller name must not be blank.")
        return normalized


class TransportInitRequest(BaseModel):
    travellers: list[TravellerDetails] = Field(min_length=1, max_length=100)
    contact_email: EmailStr
    contact_phone: str = Field(min_length=7, max_length=32, pattern=r"^\+?[0-9][0-9 ()-]{5,30}[0-9]$")


class TransportSelectionRequest(BaseModel):
    quantity: int = Field(ge=1)
