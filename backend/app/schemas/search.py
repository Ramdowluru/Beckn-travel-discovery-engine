import datetime
from datetime import timedelta, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

KOLKATA_TZ = timezone(timedelta(hours=5, minutes=30))


class SearchQuery(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    origin: str = Field("", alias="from")
    destination: str = Field("", alias="to")
    date: datetime.date | None = None
    travellers: int = Field(1)
    check_in: datetime.date | None = None
    check_out: datetime.date | None = None
    rooms: int | None = None
    guests: int | None = None
    experience_date: datetime.date | None = None
    participants: int | None = None
    tab: Literal["travel", "stays", "experiences"] = "travel"

    @field_validator("origin", "destination", mode="before")
    @classmethod
    def none_to_empty_str(cls, value):
        return "" if value is None else value

    @field_validator("date", mode="before")
    @classmethod
    def empty_date_is_none(cls, value):
        if value is None:
            return None
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return None
        return value

    @field_validator("check_in", "check_out", mode="before")
    @classmethod
    def empty_stay_date_is_none(cls, value):
        if value is None:
            return None
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return None
        return value

    @field_validator("rooms", "guests", mode="before")
    @classmethod
    def require_integer_counts(cls, value):
        if isinstance(value, bool):
            raise ValueError("Count must be an integer.")
        if isinstance(value, float) and not value.is_integer():
            raise ValueError("Count must be an integer.")
        return value

    @model_validator(mode="after")
    def validate_tab_requirements(self) -> "SearchQuery":
        if self.tab == "travel":
            origin = self.origin.strip()
            destination = self.destination.strip()

            if not origin:
                raise ValueError("Origin city cannot be empty.")
            if not destination:
                raise ValueError("Destination city cannot be empty.")
            if origin.lower() == destination.lower():
                raise ValueError("Origin and destination must be different cities.")
            if self.date is None:
                raise ValueError("Travel date is required.")

            today_kolkata = datetime.datetime.now(KOLKATA_TZ).date()
            if self.date < today_kolkata:
                raise ValueError("Travel date cannot be in the past.")

            if self.travellers < 1 or self.travellers > 9:
                raise ValueError("Travellers must be an integer between 1 and 9.")
        elif self.tab == "stays":
            if not self.destination.strip():
                raise ValueError("Destination cannot be empty.")
            if self.check_in is None:
                raise ValueError("Check-in date is required.")
            if self.check_out is None:
                raise ValueError("Check-out date is required.")

            today_kolkata = datetime.datetime.now(KOLKATA_TZ).date()
            if self.check_in < today_kolkata:
                raise ValueError("Check-in date cannot be in the past.")
            if self.check_out <= self.check_in:
                raise ValueError("Check-out date must be after check-in date.")
            if self.rooms is None or self.rooms < 1 or self.rooms > 9:
                raise ValueError("Rooms must be an integer between 1 and 9.")
            if self.guests is None or self.guests < 1 or self.guests > 18:
                raise ValueError("Guests must be an integer between 1 and 18.")
        elif self.tab == "experiences":
            if not self.destination.strip():
                raise ValueError("Destination cannot be empty.")
            if self.experience_date is None:
                self.experience_date = self.date or datetime.datetime.now(KOLKATA_TZ).date()
            today_kolkata = datetime.datetime.now(KOLKATA_TZ).date()
            if self.experience_date < today_kolkata:
                raise ValueError("Experience date cannot be in the past.")
            if self.participants is None:
                self.participants = self.travellers
            if self.participants < 1 or self.participants > 18:
                raise ValueError("Participants must be an integer between 1 and 18.")

        return self
