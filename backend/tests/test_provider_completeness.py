import unittest

from app.services.search_session import summarize_providers, valid_callbacks


def callback(provider_id: str) -> dict:
    return {
        "context": {"action": "on_search", "bpp_id": provider_id},
        "message": {"catalog": {"providers": []}},
    }


class ProviderCompletenessTests(unittest.TestCase):
    def test_all_expected_providers_respond(self):
        summary = summarize_providers(
            {"bus", "train", "flight"},
            [callback("bus"), callback("train"), callback("flight")],
        )

        self.assertEqual((summary.expected, summary.responded), (3, 3))
        self.assertFalse(summary.partial)

    def test_one_unavailable_provider_is_partial(self):
        summary = summarize_providers(
            {"bus", "train", "flight"},
            [callback("bus"), callback("flight")],
        )

        self.assertEqual((summary.expected, summary.responded), (3, 2))
        self.assertTrue(summary.partial)

    def test_zero_responding_providers_is_partial_for_non_timeout_path(self):
        summary = summarize_providers({"bus", "train", "flight"}, [])

        self.assertEqual((summary.expected, summary.responded), (3, 0))
        self.assertTrue(summary.partial)

    def test_duplicate_callbacks_do_not_inflate_response_count(self):
        summary = summarize_providers(
            {"bus", "train", "flight"},
            [callback("bus"), callback("bus"), callback("train")],
        )

        self.assertEqual(summary.responded, 2)

    def test_partial_empty_results_still_report_partial(self):
        summary = summarize_providers({"bus", "train"}, [callback("bus")])

        self.assertEqual((summary.expected, summary.responded), (2, 1))
        self.assertTrue(summary.partial)

    def test_malformed_callbacks_do_not_count(self):
        malformed = callback("bus")
        malformed["context"].pop("action")
        summary = summarize_providers({"bus"}, [malformed])

        self.assertEqual(summary.responded, 0)

    def test_unknown_bpp_does_not_count(self):
        unknown = callback("unknown")
        summary = summarize_providers({"bus"}, [unknown])

        self.assertEqual(summary.responded, 0)
        self.assertEqual(valid_callbacks([unknown], {"bus"}), [])

    def test_valid_empty_catalog_counts_as_response(self):
        summary = summarize_providers({"bus"}, [callback("bus")])

        self.assertEqual(summary.responded, 1)
        self.assertFalse(summary.partial)

    def test_malformed_catalog_does_not_count(self):
        malformed = callback("bus")
        malformed["message"]["catalog"]["providers"] = [{"id": "bus"}, "invalid"]

        self.assertEqual(summarize_providers({"bus"}, [malformed]).responded, 0)


if __name__ == "__main__":
    unittest.main()
