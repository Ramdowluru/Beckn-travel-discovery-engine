from decimal import Decimal, InvalidOperation

from pydantic import BaseModel, Field, field_validator, model_validator


class AcceptedQuote(BaseModel):
    currency: str = Field(min_length=3, max_length=8, pattern=r"^[A-Z]{3,8}$")
    value: str = Field(min_length=1, max_length=24, pattern=r"^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$")

    @field_validator("value")
    @classmethod
    def amount_must_be_finite(cls, value: str) -> str:
        try:
            amount = Decimal(value)
        except InvalidOperation as error:
            raise ValueError("Accepted quote amount is invalid.") from error
        if not amount.is_finite() or amount < 0:
            raise ValueError("Accepted quote amount is invalid.")
        return value


class ConfirmRequest(BaseModel):
    accept_final_quote: bool
    accepted_quote: AcceptedQuote

    @model_validator(mode="after")
    def require_explicit_acceptance(self):
        if self.accept_final_quote is not True:
            raise ValueError("Explicit acceptance of the final quote is required.")
        return self


class CancelRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
    confirm_cancellation: bool

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 3:
            raise ValueError("A cancellation reason is required.")
        return normalized

    @model_validator(mode="after")
    def require_explicit_cancellation(self):
        if self.confirm_cancellation is not True:
            raise ValueError("Explicit confirmation of whole-order cancellation is required.")
        return self
