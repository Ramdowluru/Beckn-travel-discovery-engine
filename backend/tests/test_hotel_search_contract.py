import asyncio
import datetime
import os
import unittest
from datetime import timedelta
from unittest.mock import MagicMock

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("GATEWAY_URL", "http://localhost:9000")
os.environ.setdefault("BAP_ID", "test-bap")
os.environ.setdefault("BAP_URI", "http://localhost:8000")

from fastapi import HTTPException
from pydantic import ValidationError

from app.api.search import search
from app.schemas.search import KOLKATA_TZ, SearchQuery


class HotelSearchContractTests(unittest.TestCase):
    def setUp(self):
        self.today = datetime.datetime.now(KOLKATA_TZ).date()
        self.check_in = self.today + timedelta(days=1)
        self.check_out = self.today + timedelta(days=3)

    def hotel_payload(self, **overrides):
        payload = {
            "to": "Hyderabad",
            "check_in": self.check_in.isoformat(),
            "check_out": self.check_out.isoformat(),
            "rooms": 2,
            "guests": 4,
            "tab": "stays",
        }
        payload.update(overrides)
        return payload

    def test_valid_hotel_contract_preserves_category_fields(self):
        query = SearchQuery.model_validate(self.hotel_payload())
        self.assertEqual(query.destination, "Hyderabad")
        self.assertEqual(query.check_in, self.check_in)
        self.assertEqual(query.check_out, self.check_out)
        self.assertEqual(query.rooms, 2)
        self.assertEqual(query.guests, 4)
        self.assertEqual(query.origin, "")
        self.assertIsNone(query.date)

    def test_hotel_does_not_require_transport_fields(self):
        query = SearchQuery.model_validate(self.hotel_payload())
        self.assertEqual(query.travellers, 1)

    def test_hotel_rejects_missing_or_past_dates(self):
        cases = [
            {"check_in": None},
            {"check_out": None},
            {"check_in": (self.today - timedelta(days=1)).isoformat()},
            {"check_out": self.check_in.isoformat()},
        ]
        for overrides in cases:
            with self.subTest(overrides=overrides):
                with self.assertRaises(ValidationError):
                    SearchQuery.model_validate(self.hotel_payload(**overrides))

    def test_hotel_rejects_invalid_room_and_guest_counts(self):
        for field, values in {
            "rooms": [0, 10, 1.5, True],
            "guests": [0, 19, 2.5, False],
        }.items():
            for value in values:
                with self.subTest(field=field, value=value):
                    with self.assertRaises(ValidationError):
                        SearchQuery.model_validate(self.hotel_payload(**{field: value}))

    def test_experience_query_uses_travellers_when_participants_are_omitted(self):
        query = SearchQuery.model_validate({
            "to": "Hyderabad",
            "tab": "experiences",
            "travellers": 2,
        })
        self.assertEqual(query.participants, 2)
        self.assertEqual(query.experience_date, datetime.date.today())

    def test_transport_contract_remains_valid(self):
        query = SearchQuery.model_validate({
            "from": "Visakhapatnam",
            "to": "Hyderabad",
            "date": self.check_in.isoformat(),
            "travellers": 9,
            "tab": "travel",
        })
        self.assertEqual(query.origin, "Visakhapatnam")
        self.assertEqual(query.travellers, 9)
        self.assertIsNone(query.check_in)
        self.assertIsNone(query.rooms)
