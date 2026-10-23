import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SearchQuery(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    origin: str = Field("", alias="from")
    destination: str = Field(alias="to", min_length=1)
    date: datetime.date | None = None
    travellers: int = Field(1, ge=1)
    tab: Literal["travel", "stays", "experiences"] = "travel"

    @field_validator("date", mode="before")
    @classmethod
    def empty_date_is_none(cls, value):
        return None if value == "" else value