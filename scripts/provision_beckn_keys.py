"""Provision isolated local mock identities once; never print private material."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from nacl.signing import SigningKey


def provision(home, bap_id="travel-discovery-bap", bap_uri="http://localhost:8000"):
    home.mkdir(parents=True, exist_ok=True)
    participants = {bap_id: bap_uri, "mock-gateway.example.in": "http://localhost:9000"}
    for name in ("bus", "train", "flight", "hotel", "experience"):
        data = json.loads((ROOT / "mock_providers" / ("mock_" + name) / "data.json").read_text(encoding="utf-8"))
        participants[data["provider"]["bpp_id"]] = data["provider"]["bpp_uri"]
    registry = {}
    for subscriber, uri in participants.items():
        path = home / (hashlib.sha256(subscriber.encode()).hexdigest() + ".key")
        if path.exists():
            key = SigningKey(base64.b64decode(path.read_bytes(), validate=True))
        else:
            key = SigningKey.generate()
            with path.open("xb") as stream:
                stream.write(base64.b64encode(bytes(key)))
            path.chmod(0o600)
        registry[subscriber] = {"key_id": "local-1", "public_key": base64.b64encode(bytes(key.verify_key)).decode(), "uri": uri}
    (home / "registry.json").write_text(json.dumps(registry, indent=2), encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--bap-id", default="travel-discovery-bap")
    parser.add_argument("--bap-uri", default="http://localhost:8000")
    parser.add_argument("--directory", type=Path, default=ROOT / ".local" / "beckn")
    args = parser.parse_args()
    provision(args.directory, args.bap_id, args.bap_uri)
    print("Local mock identities provisioned; private keys were not displayed.")
