import re
from typing import Any

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE = re.compile(r"^\+?[0-9][0-9 ()-]{5,30}[0-9]$")


def valid_person_names(names: list[Any], expected_count: int) -> bool:
    return (
        len(names) == expected_count
        and all(isinstance(name, str) and 1 <= len(name.strip()) <= 120 for name in names)
    )


def valid_lead_contact(billing: Any) -> bool:
    if not isinstance(billing, dict):
        return False
    name = billing.get("name")
    email = billing.get("email")
    phone = billing.get("phone")
    return (
        isinstance(name, str)
        and 1 <= len(name.strip()) <= 120
        and isinstance(email, str)
        and len(email) <= 254
        and _EMAIL.fullmatch(email) is not None
        and isinstance(phone, str)
        and 7 <= len(phone) <= 32
        and _PHONE.fullmatch(phone) is not None
    )
