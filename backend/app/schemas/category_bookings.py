from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator


Gender = Literal["female", "male", "non_binary", "prefer_not_to_say"]


class CategorySelectRequest(BaseModel):
    quantity: int = Field(ge=1, le=18)


class NamedPerson(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    gender: Gender | None = None
    age: int | None = Field(default=None, ge=0, le=120)

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Guest or participant name must not be blank.")
        return normalized


class CategoryInitRequest(BaseModel):
    people: list[NamedPerson] = Field(min_length=1, max_length=18)
    room_assignments: list[int] | None = Field(default=None, min_length=1, max_length=18)
    contact_email: EmailStr
    contact_phone: str = Field(
        min_length=7,
        max_length=32,
        pattern=r"^\+?[0-9][0-9 ()-]{5,30}[0-9]$",
    )

    @field_validator("room_assignments")
    @classmethod
    def room_assignments_are_positive(cls, value: list[int] | None) -> list[int] | None:
        if value is not None and any(room < 1 for room in value):
            raise ValueError("Room numbers must be positive.")
        return value
