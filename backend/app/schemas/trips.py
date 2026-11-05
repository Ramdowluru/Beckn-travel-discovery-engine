from datetime import date
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class TripMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=120)
    destination: str = Field(min_length=1, max_length=160)
    start_date: date
    end_date: date

    @field_validator("title", "destination", mode="before")
    @classmethod
    def trim_required_text(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_date_range(self) -> "TripMetadata":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class TripCreateRequest(TripMetadata):
    pass


class TripUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=120)
    destination: str | None = Field(default=None, min_length=1, max_length=160)
    start_date: date | None = None
    end_date: date | None = None

    @field_validator("title", "destination", mode="before")
    @classmethod
    def trim_optional_text(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_supplied_fields(self) -> "TripUpdateRequest":
        if not self.model_fields_set:
            raise ValueError("At least one trip field must be provided")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Trip fields cannot be null")
        if self.start_date is not None and self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class TripBookingReference(BaseModel):
    booking_id: str
    status: str
    booking: dict[str, Any] | None


class TripResponse(BaseModel):
    id: str
    title: str
    destination: str
    start_date: str
    end_date: str
    bookings: list[TripBookingReference]
    created_at: str
    updated_at: str
