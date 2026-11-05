"""Ed25519 HTTP signatures over exact body bytes; pinned local mock registry.

Signature layout follows SubscriberAuth. BLAKE2b-512 digest convention follows
the ONDC/Beckn reference crypto implementation. This is NOT public registry enrollment.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import time
from urllib.parse import urlsplit

from nacl.signing import SigningKey, VerifyKey
from nacl.exceptions import BadSignatureError

from protocol.contracts import ProtocolError

DEFAULT_HOME = Path(__file__).resolve().parents[1] / ".local" / "beckn"


def wire_bytes(payload):
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def digest(body):
    return "BLAKE-512=" + base64.b64encode(hashlib.blake2b(body, digest_size=64).digest()).decode("ascii")


def signing_string(body, created, expires):
    return f"(created): {created}\n(expires): {expires}\ndigest: {digest(body)}".encode("utf-8")


class Identity:
    def __init__(self, subscriber, private_key, registry, clock=time.time):
        self.subscriber = subscriber
        self.key = SigningKey(private_key)
        self.registry = registry
        self.clock = clock
        self.seen = {}
        entry = registry.get(subscriber)
        if not entry or entry["public_key"] != base64.b64encode(bytes(self.key.verify_key)).decode():
            raise ProtocolError("Local signing identity is not registered")

    @classmethod
    def load(cls, subscriber):
        home = Path(os.environ.get("BECKN_KEYS_DIR", str(DEFAULT_HOME)))
        registry = json.loads((home / "registry.json").read_text(encoding="utf-8"))
        name = hashlib.sha256(subscriber.encode()).hexdigest() + ".key"
        return cls(subscriber, base64.b64decode((home / name).read_bytes(), validate=True), registry)

    def address(self, subscriber):
        try:
            return self.registry[subscriber]["uri"].rstrip("/")
        except KeyError as exc:
            raise ProtocolError("Unknown subscriber") from exc

    def check_address(self, subscriber, uri):
        # The local test network uses localhost and 127.0.0.1 interchangeably.
        def normalized(value):
            u = urlsplit(value)
            host = "loopback" if u.hostname in ("localhost", "127.0.0.1", "::1") else u.hostname
            return u.scheme, host, u.port, u.path.rstrip("/")
        if normalized(uri) != normalized(self.address(subscriber)):
            raise ProtocolError("Subscriber callback address differs from trusted registry")

    def headers(self, body):
        created = int(self.clock())
        expires = created + 30
        signature = base64.b64encode(self.key.sign(signing_string(body, created, expires)).signature).decode()
        key_id = self.registry[self.subscriber]["key_id"]
        auth = (f'Signature keyId="{self.subscriber}|{key_id}|ed25519",algorithm="ed25519",'
                f'created="{created}",expires="{expires}",headers="(created) (expires) digest",signature="{signature}"')
        return {"Authorization": auth, "Digest": digest(body), "Content-Type": "application/json"}

    def verify(self, body, headers, expected_sender):
        auth = (
            headers.get("authorization")
            or headers.get("Authorization")
            or headers.get("x-gateway-authorization")
            or headers.get("X-Gateway-Authorization")
            or ""
        )
        if not auth.startswith("Signature "):
            raise ProtocolError("Missing subscriber signature")
        pairs = re.findall(r'([A-Za-z]+)="([^"\r\n]*)"', auth[10:])
        fields = dict(pairs)
        if len(fields) != len(pairs) or set(fields) != {"keyId", "algorithm", "created", "expires", "headers", "signature"}:
            raise ProtocolError("Malformed subscriber signature")
        entry = self.registry.get(expected_sender)
        if not entry or fields["keyId"] != f'{expected_sender}|{entry["key_id"]}|ed25519':
            raise ProtocolError("Untrusted signing key")
        if fields["algorithm"] != "ed25519" or fields["headers"] != "(created) (expires) digest":
            raise ProtocolError("Unsupported signature parameters")
        try:
            created, expires = int(fields["created"]), int(fields["expires"])
            now = int(self.clock())
            if created > now + 5 or expires <= now or not 0 < expires - created <= 300:
                raise ProtocolError("Expired/future signature")
            claimed_digest = headers.get("digest", headers.get("Digest"))
            if claimed_digest and claimed_digest != digest(body):
                raise ProtocolError("Body digest mismatch")
            VerifyKey(base64.b64decode(entry["public_key"], validate=True)).verify(
                signing_string(body, created, expires), base64.b64decode(fields["signature"], validate=True))
        except (ValueError, TypeError, BadSignatureError) as exc:
            raise ProtocolError("Invalid signature") from exc
        self.seen = {k: expiry for k, expiry in self.seen.items() if expiry > now}
        replay_key = (expected_sender, fields["signature"])
        if replay_key in self.seen:
            raise ProtocolError("Replayed signed request")
        if len(self.seen) >= 10000:
            raise ProtocolError("Replay cache capacity exceeded")
        self.seen[replay_key] = expires


async def signed_post(client, url, payload, identity):
    body = wire_bytes(payload)
    return await client.post(url, content=body, headers=identity.headers(body))
