import datetime
import os
from datetime import timedelta, timezone
import unittest
from unittest.mock import MagicMock

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("GATEWAY_URL", "http://localhost:9000")
os.environ.setdefault("BAP_ID", "test-bap")
os.environ.setdefault("BAP_URI", "http://localhost:8000")

from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.search import KOLKATA_TZ, SearchQuery
from app.api.search import search


class SearchValidationTests(unittest.TestCase):
    def setUp(self):
        self.today_kolkata = datetime.datetime.now(KOLKATA_TZ).date()
        self.tomorrow_kolkata = self.today_kolkata + timedelta(days=1)
        self.yesterday_kolkata = self.today_kolkata - timedelta(days=1)

    def _call_search_endpoint(self, **kwargs):
        mock_request = MagicMock()
        coro = search(request=mock_request, **kwargs)
        try:
            coro.send(None)
        finally:
            coro.close()

    # ── 1. Missing Fields ──────────────────────────────────────
    def test_missing_origin_raises_error_for_travel(self):
        for empty_val in ["", None]:
            with self.subTest(empty_val=empty_val):
                with self.assertRaises(ValidationError) as ctx:
                    SearchQuery.model_validate({
                        "from": empty_val,
                        "to": "Hyderabad",
                        "date": self.tomorrow_kolkata.isoformat(),
                        "travellers": 1,
                        "tab": "travel",
                    })
                self.assertIn("Origin city cannot be empty", str(ctx.exception))

    def test_missing_destination_raises_error_for_travel(self):
        for empty_val in ["", None]:
            with self.subTest(empty_val=empty_val):
                with self.assertRaises(ValidationError) as ctx:
                    SearchQuery.model_validate({
                        "from": "Visakhapatnam",
                        "to": empty_val,
                        "date": self.tomorrow_kolkata.isoformat(),
                        "travellers": 1,
                        "tab": "travel",
                    })
                self.assertIn("Destination city cannot be empty", str(ctx.exception))

    def test_missing_date_raises_error_for_travel(self):
        for empty_val in ["", None]:
            with self.subTest(empty_val=empty_val):
                with self.assertRaises(ValidationError) as ctx:
                    SearchQuery.model_validate({
                        "from": "Visakhapatnam",
                        "to": "Hyderabad",
                        "date": empty_val,
                        "travellers": 1,
                        "tab": "travel",
                    })
                self.assertIn("Travel date is required", str(ctx.exception))

    def test_non_travel_tabs_do_not_require_origin_or_date(self):
        query = SearchQuery.model_validate({
            "to": "Goa",
            "tab": "stays",
            "check_in": self.tomorrow_kolkata.isoformat(),
            "check_out": (self.tomorrow_kolkata + timedelta(days=2)).isoformat(),
            "rooms": 1,
            "guests": 2,
        })
        self.assertEqual(query.destination, "Goa")
        self.assertEqual(query.origin, "")
        self.assertIsNone(query.date)

        exp_query = SearchQuery.model_validate({
            "to": "Goa",
            "tab": "experiences",
            "travellers": 4,
        })
        self.assertEqual(exp_query.destination, "Goa")

    # ── 2. Whitespace ──────────────────────────────────────────
    def test_whitespace_only_fields_raise_error(self):
        with self.assertRaises(ValidationError) as ctx:
            SearchQuery.model_validate({
                "from": "   ",
                "to": "Hyderabad",
                "date": self.tomorrow_kolkata.isoformat(),
                "travellers": 1,
                "tab": "travel",
            })
        self.assertIn("Origin city cannot be empty", str(ctx.exception))

        with self.assertRaises(ValidationError) as ctx:
            SearchQuery.model_validate({
                "from": "Visakhapatnam",
                "to": "   ",
                "date": self.tomorrow_kolkata.isoformat(),
                "travellers": 1,
                "tab": "travel",
            })
        self.assertIn("Destination city cannot be empty", str(ctx.exception))

        with self.assertRaises(ValidationError) as ctx:
            SearchQuery.model_validate({
                "from": "Visakhapatnam",
                "to": "Hyderabad",
                "date": "   ",
                "travellers": 1,
                "tab": "travel",
            })
        self.assertIn("Travel date is required", str(ctx.exception))

    def test_surrounding_whitespace_is_trimmed(self):
        query = SearchQuery.model_validate({
            "from": "  Visakhapatnam  ",
            "to": "  Hyderabad  ",
            "date": self.tomorrow_kolkata.isoformat(),
            "travellers": 1,
            "tab": "travel",
        })
        self.assertEqual(query.origin, "Visakhapatnam")
        self.assertEqual(query.destination, "Hyderabad")

    # ── 3. Identical Cities (Case-Insensitive) ──────────────────
    def test_identical_cities_raise_error(self):
        cases = [
            ("Hyderabad", "Hyderabad"),
            ("hyderabad", "HYDERABAD"),
            ("  Hyderabad  ", "hyderabad "),
            ("VISAKHAPATNAM", "visakhapatnam"),
        ]
        for origin, destination in cases:
            with self.subTest(origin=origin, destination=destination):
                with self.assertRaises(ValidationError) as ctx:
                    SearchQuery.model_validate({
                        "from": origin,
                        "to": destination,
                        "date": self.tomorrow_kolkata.isoformat(),
                        "travellers": 1,
                        "tab": "travel",
                    })
                self.assertIn("Origin and destination must be different cities", str(ctx.exception))

    # ── 4. Malformed / Past Dates ──────────────────────────────
    def test_past_date_raises_error(self):
        with self.assertRaises(ValidationError) as ctx:
            SearchQuery.model_validate({
                "from": "Visakhapatnam",
                "to": "Hyderabad",
                "date": self.yesterday_kolkata.isoformat(),
                "travellers": 1,
                "tab": "travel",
            })
        self.assertIn("Travel date cannot be in the past", str(ctx.exception))

    def test_malformed_date_raises_error(self):
        for bad_date in ["not-a-date", "2026-13-45", "26-10-2026", "2026/10/26"]:
            with self.subTest(bad_date=bad_date):
                with self.assertRaises(ValidationError):
                    SearchQuery.model_validate({
                        "from": "Visakhapatnam",
                        "to": "Hyderabad",
                        "date": bad_date,
                        "travellers": 1,
                        "tab": "travel",
                    })

    def test_today_and_future_dates_are_valid(self):
        today_query = SearchQuery.model_validate({
            "from": "Visakhapatnam",
            "to": "Hyderabad",
            "date": self.today_kolkata.isoformat(),
            "travellers": 1,
            "tab": "travel",
        })
        self.assertEqual(today_query.date, self.today_kolkata)

        future_date = self.today_kolkata + timedelta(days=30)
        future_query = SearchQuery.model_validate({
            "from": "Visakhapatnam",
            "to": "Hyderabad",
            "date": future_date.isoformat(),
            "travellers": 1,
            "tab": "travel",
        })
        self.assertEqual(future_query.date, future_date)

    # ── 5. Traveller Boundaries ────────────────────────────────
    def test_traveller_boundaries(self):
        # 0 travellers is invalid
        with self.assertRaises(ValidationError) as ctx:
            SearchQuery.model_validate({
                "from": "Visakhapatnam",
                "to": "Hyderabad",
                "date": self.tomorrow_kolkata.isoformat(),
                "travellers": 0,
                "tab": "travel",
            })
        self.assertIn("Travellers must be an integer between 1 and 9", str(ctx.exception))

        # 10 travellers is invalid for travel
        with self.assertRaises(ValidationError) as ctx:
            SearchQuery.model_validate({
                "from": "Visakhapatnam",
                "to": "Hyderabad",
                "date": self.tomorrow_kolkata.isoformat(),
                "travellers": 10,
                "tab": "travel",
            })
        self.assertIn("Travellers must be an integer between 1 and 9", str(ctx.exception))

        # 1 traveller is valid
        q1 = SearchQuery.model_validate({
            "from": "Visakhapatnam",
            "to": "Hyderabad",
            "date": self.tomorrow_kolkata.isoformat(),
            "travellers": 1,
            "tab": "travel",
        })
        self.assertEqual(q1.travellers, 1)

        # 9 travellers is valid
        q9 = SearchQuery.model_validate({
            "from": "Visakhapatnam",
            "to": "Hyderabad",
            "date": self.tomorrow_kolkata.isoformat(),
            "travellers": 9,
            "tab": "travel",
        })
        self.assertEqual(q9.travellers, 9)

    # ── 6. Valid Request ───────────────────────────────────────
    def test_valid_travel_request(self):
        query = SearchQuery.model_validate({
            "from": "Visakhapatnam",
            "to": "Hyderabad",
            "date": self.tomorrow_kolkata.isoformat(),
            "travellers": 2,
            "tab": "travel",
        })
        self.assertEqual(query.origin, "Visakhapatnam")
        self.assertEqual(query.destination, "Hyderabad")
        self.assertEqual(query.date, self.tomorrow_kolkata)
        self.assertEqual(query.travellers, 2)
        self.assertEqual(query.tab, "travel")

    # ── 7. Direct FastAPI Endpoint Returns Useful 422 Errors ───
    def test_search_endpoint_returns_422_on_invalid_request(self):
        # Identical cities
        with self.assertRaises(HTTPException) as ctx:
            self._call_search_endpoint(
                origin="Hyderabad",
                destination="hyderabad",
                date=self.tomorrow_kolkata.isoformat(),
                travellers=1,
                tab="travel",
            )
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertTrue(any("Origin and destination must be different cities" in err["msg"] for err in ctx.exception.detail))

        # Missing origin
        with self.assertRaises(HTTPException) as ctx:
            self._call_search_endpoint(
                origin="",
                destination="Hyderabad",
                date=self.tomorrow_kolkata.isoformat(),
                travellers=1,
                tab="travel",
            )
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertTrue(any("Origin city cannot be empty" in err["msg"] for err in ctx.exception.detail))

        # Past date
        with self.assertRaises(HTTPException) as ctx:
            self._call_search_endpoint(
                origin="Visakhapatnam",
                destination="Hyderabad",
                date=self.yesterday_kolkata.isoformat(),
                travellers=1,
                tab="travel",
            )
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertTrue(any("Travel date cannot be in the past" in err["msg"] for err in ctx.exception.detail))

        # 0 travellers
        with self.assertRaises(HTTPException) as ctx:
            self._call_search_endpoint(
                origin="Visakhapatnam",
                destination="Hyderabad",
                date=self.tomorrow_kolkata.isoformat(),
                travellers=0,
                tab="travel",
            )
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertTrue(any("Travellers must be an integer between 1 and 9" in err["msg"] for err in ctx.exception.detail))

        # 10 travellers
        with self.assertRaises(HTTPException) as ctx:
            self._call_search_endpoint(
                origin="Visakhapatnam",
                destination="Hyderabad",
                date=self.tomorrow_kolkata.isoformat(),
                travellers=10,
                tab="travel",
            )
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertTrue(any("Travellers must be an integer between 1 and 9" in err["msg"] for err in ctx.exception.detail))


if __name__ == "__main__":
    unittest.main()
