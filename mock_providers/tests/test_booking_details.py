import unittest

from common.booking_details import valid_lead_contact, valid_person_names


class BookingDetailsTests(unittest.TestCase):
    def test_names_match_count_and_length(self):
        self.assertTrue(valid_person_names(["Passenger"], 1))
        self.assertFalse(valid_person_names(["Passenger", "Extra"], 1))
        self.assertFalse(valid_person_names([" "], 1))
        self.assertFalse(valid_person_names(["x" * 121], 1))

    def test_lead_contact_uses_the_bap_validation_shape(self):
        valid = {"name": "Passenger", "email": "passenger@example.com", "phone": "+91 90000-00000"}
        self.assertTrue(valid_lead_contact(valid))
        self.assertFalse(valid_lead_contact({**valid, "email": "not-an-email"}))
        self.assertFalse(valid_lead_contact({**valid, "phone": "not-a-phone"}))


if __name__ == "__main__":
    unittest.main()
