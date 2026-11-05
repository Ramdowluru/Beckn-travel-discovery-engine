import re
from typing import Any

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE = re.compile(r"^\+?[0-9][0-9 ()-]{5,30}[0-9]$")
_GENDERS = {"female", "male", "non_binary", "prefer_not_to_say"}


def valid_person_names(names: list[Any], expected_count: int) -> bool:
    return (
        len(names) == expected_count
        and all(isinstance(name, str) and 1 <= len(name.strip()) <= 120 for name in names)
    )


def valid_person_genders(genders: list[Any], expected_count: int) -> bool:
    return len(genders) <= expected_count and all(
        isinstance(gender, str) and gender in _GENDERS for gender in genders
    )


def valid_person_ages(ages: list[Any], expected_count: int) -> bool:
    if len(ages) > expected_count:
        return False
    for age in ages:
        if not isinstance(age, str) or not age.isdecimal():
            return False
        if not 0 <= int(age) <= 120:
            return False
    return True


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
