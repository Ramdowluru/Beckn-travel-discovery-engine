import unittest

from pydantic import ValidationError

from app.schemas.category_bookings import NamedPerson
from app.schemas.selections import TravellerDetails


class CustomerGenderSchemaTests(unittest.TestCase):
    def test_gender_is_optional_for_existing_clients(self):
        self.assertEqual(TravellerDetails(name="Passenger").gender, None)
        self.assertEqual(NamedPerson(name="Guest").gender, None)

    def test_gender_accepts_supported_values(self):
        self.assertEqual(TravellerDetails(name="Passenger", gender="non_binary").gender, "non_binary")
        self.assertEqual(NamedPerson(name="Guest", gender="prefer_not_to_say").gender, "prefer_not_to_say")

    def test_gender_rejects_unknown_values(self):
        with self.assertRaises(ValidationError):
            TravellerDetails(name="Passenger", gender="unknown")
        with self.assertRaises(ValidationError):
            NamedPerson(name="Guest", gender="unknown")

    def test_participant_age_is_optional_and_bounded(self):
        self.assertIsNone(NamedPerson(name="Participant").age)
        self.assertEqual(NamedPerson(name="Participant", age=21).age, 21)
        for age in (-1, 121):
            with self.subTest(age=age), self.assertRaises(ValidationError):
                NamedPerson(name="Participant", age=age)
