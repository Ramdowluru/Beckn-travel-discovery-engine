"""Official schema, project policy, signature and request-cycle regressions."""
import asyncio
import base64
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest
from uuid import uuid4

from nacl.signing import SigningKey
from app.schemas.search import SearchQuery
from app.services.beckn_builder import build_transport_search
from app.services.search_session import start_session, end_session, add_response, set_expected_provider_ids
from app.services.transport_normalizer import normalize_transport_callbacks
from protocol.contracts import ProtocolError, validate_schema, validate_message, ack, require_ack
from protocol.signing import Identity, wire_bytes, digest
from mock_providers.common.beckn_converter import build_on_search

ROOT = Path(__file__).resolve().parents[2]


def pair(mode="bus", travellers=2):
    tomorrow = (datetime.now(timezone(timedelta(hours=5, minutes=30))).date() + timedelta(days=1)).isoformat()
    query = SearchQuery.model_validate({"from": "Vijayawada", "to": "Hyderabad", "date": tomorrow, "travellers": travellers})
    request = build_transport_search(query, str(uuid4()))
    inventory = json.loads((ROOT / "mock_providers" / ("mock_" + mode) / "data.json").read_text(encoding="utf-8"))
    return request, build_on_search(inventory, request)


class ContractTests(unittest.TestCase):
    def test_startup_prepares_validators_without_request_time_schema_reads(self):
        from unittest.mock import patch
        from protocol.contracts import prepare_discovery_validation
        prepare_discovery_validation()
        request, callback = pair()
        with patch("pathlib.Path.read_text", side_effect=AssertionError("Schema read during request")):
            validate_message(request, "search")
            validate_message(callback, "on_search")
            import httpx
            require_ack(httpx.Response(200, json=ack()))

    def test_callback_rejection_reason_is_preserved(self):
        import httpx
        with self.assertRaisesRegex(ProtocolError, "Protocol request rejected: closed request cycle"):
            require_ack(httpx.Response(200, json=ack("closed request cycle")))

    def test_all_actual_providers_validate_both_pinned_specs(self):
        total = 0
        for mode in ("bus", "train", "flight"):
            request, callback = pair(mode)
            for data, action in ((request, "search"), (callback, "on_search")):
                validate_message(data, action)
            self.assertEqual(request["context"]["transaction_id"], callback["context"]["transaction_id"])
            self.assertEqual(request["context"]["message_id"], callback["context"]["message_id"])
            options = normalize_transport_callbacks([callback], 2)
            total += len(options)
            for option in options:
                self.assertEqual(option["totalPrice"], option["unitPrice"] * 2)
        self.assertEqual(total, 8)

    def test_schema_negative_envelope_uuid_timestamp_action(self):
        request, callback = pair()
        for field in ("context", "message"):
            changed = deepcopy(request); changed.pop(field)
            with self.assertRaises(ProtocolError): validate_schema(changed, "search")
        for field, value in (("transaction_id", "bad"), ("message_id", "bad"), ("timestamp", "yesterday"), ("action", "confirm")):
            changed = deepcopy(callback); changed["context"][field] = value
            with self.subTest(field=field):
                with self.assertRaises(ProtocolError): validate_message(changed, "on_search")

    def test_profile_not_confused_with_permissive_core(self):
        request, callback = pair()
        changed = deepcopy(request); changed["context"].pop("version")
        validate_schema(changed, "search")  # Optional in generic core; required by local policy.
        with self.assertRaises(ProtocolError): validate_message(changed, "search")
        provider = callback["message"]["catalog"]["providers"][0]
        provider["items"][0]["category_id"] = "BUS"
        validate_schema(callback, "on_search")
        with self.assertRaises(ProtocolError): validate_message(callback, "on_search")

    def test_references_expiry_and_empty_catalog(self):
        request, callback = pair()
        changed = deepcopy(callback)
        changed["message"]["catalog"]["providers"][0]["items"][0]["fulfillment_ids"] = ["missing"]
        with self.assertRaises(ProtocolError): validate_message(changed, "on_search")
        changed = deepcopy(callback); changed["context"]["timestamp"] = (datetime.now(timezone.utc)-timedelta(seconds=60)).isoformat()
        with self.assertRaises(ProtocolError): validate_message(changed, "on_search")
        callback["message"]["catalog"]["providers"][0]["items"] = []
        validate_message(callback, "on_search")

    def test_session_correlation_and_duplicate_per_sender(self):
        request, callback = pair()
        tx = request["context"]["transaction_id"]
        start_session(tx, request["context"])
        set_expected_provider_ids(tx, [callback["context"]["bpp_id"]])
        try:
            for field in ("message_id", "bap_id", "bap_uri", "domain", "version"):
                changed = deepcopy(callback)
                changed["context"][field] = str(uuid4()) if field == "message_id" else "wrong"
                self.assertFalse(add_response(tx, changed), field)
            self.assertTrue(add_response(tx, callback))
            self.assertFalse(add_response(tx, callback))
        finally:
            self.assertEqual(len(end_session(tx)), 1)
        self.assertFalse(add_response(tx, callback))

    def test_ack_nack_and_invalid_response(self):
        import httpx
        for body in (ack(), ack("invalid message")):
            validate_schema(body, "search", response=True)
        self.assertEqual(require_ack(httpx.Response(200, json=ack()))["message"]["ack"]["status"], "ACK")
        for response in (httpx.Response(400, json=ack("bad")), httpx.Response(200, text="not JSON")):
            with self.assertRaises(ProtocolError): require_ack(response)


class SigningTests(unittest.TestCase):
    def setUp(self):
        self.now = 2000000000
        a, b = SigningKey.generate(), SigningKey.generate()
        self.registry = {name: {"key_id": "local-1", "public_key": base64.b64encode(bytes(key.verify_key)).decode(), "uri": uri}
                         for name, key, uri in (("bap", a, "http://localhost:8000"), ("bpp", b, "http://localhost:5001"))}
        self.sender = Identity("bap", bytes(a), self.registry, lambda: self.now)
        self.receiver = Identity("bpp", bytes(b), self.registry, lambda: self.now)
        self.body = wire_bytes({"message": "exact bytes"})

    def test_signature_roundtrip_replay_and_expiry(self):
        headers = self.sender.headers(self.body)
        self.receiver.verify(self.body, headers, "bap")
        with self.assertRaises(ProtocolError): self.receiver.verify(self.body, headers, "bap")

    def test_gateway_authorization_header_roundtrip(self):
        headers = self.sender.headers(self.body)
        gateway_headers = self.receiver.headers(self.body)
        gateway_headers["X-Gateway-Authorization"] = gateway_headers.pop("Authorization")
        self.sender.verify(self.body, gateway_headers, "bpp")
        self.now += 31
        with self.assertRaises(ProtocolError): self.receiver.verify(self.body, headers, "bap")

    def test_tampering_wrong_identity_missing_header(self):
        headers = self.sender.headers(self.body)
        for body, h, sender in ((self.body+b" ", headers, "bap"), (self.body, headers, "bpp"), (self.body, {}, "bap")):
            with self.assertRaises(ProtocolError): self.receiver.verify(body, h, sender)
        self.receiver.verify(self.body, headers, "bap")

    def test_callback_address_is_pinned(self):
        self.receiver.check_address("bap", "http://127.0.0.1:8000")
        with self.assertRaises(ProtocolError): self.receiver.check_address("bap", "http://attacker.example:8000")

    def test_ed25519_rfc8032_vector(self):
        # RFC 8032 section 7.1, empty-message test vector; independent primitive check.
        seed = bytes.fromhex("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60")
        signature = SigningKey(seed).sign(b"").signature.hex()
        self.assertEqual(signature, "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b")


if __name__ == "__main__":
    unittest.main()
