"""Offline validation against pinned OpenAPI 3.0 schemas plus TDE policy.

The extra policy is intentionally named separately from official schema validation.
"""
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
import re
from uuid import UUID

import yaml
from jsonschema import Draft7Validator, FormatChecker
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT7

VERSION = "1.1.0"
DOMAIN = "TRV"  # TDE local network identifier, not an official domain assignment.
TTL = "PT30S"
ROOT = Path(__file__).resolve().parent


class ProtocolError(ValueError):
    pass


def now_string():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


@lru_cache(maxsize=12)
def schema_document(baseline):
    return yaml.safe_load((ROOT / "specs" / (baseline + ".yaml")).read_text(encoding="utf-8"))


@lru_cache(maxsize=12)
def validator(action, baseline="core-v1.1.0", response=False):
    document = schema_document(baseline)
    operation = document["paths"]["/" + action]["post"]
    if response:
        response_spec = operation["responses"].get("200", operation["responses"].get("default"))
        while "$ref" in response_spec:
            target = document
            for token in response_spec["$ref"][2:].split("/"):
                target = target[token.replace("~1", "/").replace("~0", "~")]
            response_spec = target
        schema = response_spec["content"]["application/json"]["schema"]
    else:
        schema = operation["requestBody"]["content"]["application/json"]["schema"]
    uri = "urn:tde:beckn:" + baseline
    registry = Registry().with_resource(uri, Resource.from_contents(document, default_specification=DRAFT7))
    # All schema references in the bundled official artifacts are local JSON pointers.
    return Draft7Validator(schema, registry=registry, format_checker=FormatChecker(),
                           _resolver=registry.resolver(uri))


def prepare_discovery_validation():
    """Load offline discovery contracts before accepting latency-sensitive requests."""
    for action in ("search", "on_search"):
        for baseline in ("core-v1.1.0", "mobility-core1.1"):
            validator(action, baseline)
    validator("search", response=True)


def prepare_order_validation():
    for action in ("select", "on_select", "init", "on_init", "confirm", "on_confirm", "status", "on_status", "cancel", "on_cancel"):
        validator(action)
        validator(action, response=True)


def validate_schema(payload, action, baseline="core-v1.1.0", response=False):
    errors = sorted(validator(action, baseline, response).iter_errors(payload), key=lambda e: str(e.path))
    if errors:
        e = errors[0]
        raise ProtocolError("/" + "/".join(map(str, e.path)) + ": " + e.message)


def timestamp(value):
    if not isinstance(value, str):
        raise ProtocolError("Timestamp must be RFC3339")
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ProtocolError("Invalid timestamp") from exc
    if result.tzinfo is None:
        raise ProtocolError("Timestamp must include timezone")
    return result


def validate_message(payload, action, fresh=True):
    validate_schema(payload, action)
    is_transport = _is_transport_message(payload)
    if is_transport:
        validate_schema(payload, action, "mobility-core1.1")
    context = payload.get("context", {})
    required = ("domain", "version", "action", "transaction_id", "message_id", "timestamp", "ttl", "bap_id", "bap_uri")
    if any(not context.get(name) for name in required):
        raise ProtocolError("TDE profile: incomplete context")
    if context["version"] != VERSION or context["domain"] != DOMAIN or context["action"] != action:
        raise ProtocolError("TDE profile: wrong version/domain/action")
    for name in ("transaction_id", "message_id"):
        try:
            UUID(context[name])
        except (ValueError, TypeError, AttributeError) as exc:
            raise ProtocolError("TDE profile: invalid " + name) from exc
    match = re.fullmatch(r"PT([1-9][0-9]*)S", context["ttl"])
    if not match or not 1 <= int(match[1]) <= 300:
        raise ProtocolError("TDE profile: TTL must be 1-300 seconds")
    age = (datetime.now(timezone.utc) - timestamp(context["timestamp"])).total_seconds()
    if fresh and (age < -5 or age > int(match[1])):
        raise ProtocolError("TDE profile: expired/future message")
    if action == "search" and is_transport:
        intent = payload.get("message", {}).get("intent", {})
        stops = intent.get("fulfillment", {}).get("stops", [])
        if {s.get("type") for s in stops if isinstance(s, dict)} != {"START", "END"}:
            raise ProtocolError("TDE transport: START and END required")
        for stop in stops:
            if not stop.get("location", {}).get("descriptor", {}).get("name"):
                raise ProtocolError("TDE transport: city name required")
        if "start" in intent.get("fulfillment", {}):
            raise ProtocolError("Use stop.time, not legacy fulfillment.start")
    elif action == "search":
        if _is_experience_message(payload):
            _validate_experience_search(payload)
        else:
            _validate_hotel_search(payload)
    elif action == "on_search":
        if not context.get("bpp_id") or not context.get("bpp_uri"):
            raise ProtocolError("TDE profile: callback sender missing")
        if "error" in payload:
            return  # Schema-validated error callbacks carry no offers.
        providers = payload.get("message", {}).get("catalog", {}).get("providers")
        if not isinstance(providers, list):
            raise ProtocolError("TDE discovery: successful callback requires providers")
        for provider in providers:
            if not provider.get("id") or not provider.get("descriptor", {}).get("name"):
                raise ProtocolError("TDE discovery: provider identity required")
            maps = {name: {v.get("id") for v in provider.get(name, [])} for name in ("fulfillments", "locations", "categories")}
            for item in provider.get("items", []):
                if "fulfillment" in item or "category_id" in item:
                    raise ProtocolError("TDE profile: legacy inline item relationships forbidden")
                if not item.get("id") or not item.get("fulfillment_ids"):
                    raise ProtocolError("TDE profile: item references required")
                for refs, collection in (("fulfillment_ids", "fulfillments"), ("location_ids", "locations"), ("category_ids", "categories")):
                    if not item.get(refs) or any(ref not in maps[collection] for ref in item[refs]):
                        raise ProtocolError("TDE profile: unresolved " + refs)
    elif action in {"select", "on_select", "init", "on_init", "confirm", "on_confirm", "status", "on_status", "cancel", "on_cancel"}:
        if action.startswith("on_") and "error" in payload:
            return
        if action == "cancel":
            if not payload.get("message", {}).get("order_id"):
                raise ProtocolError("TDE cancellation: provider order id is required")
            return
        if action in {"status", "on_status"} and (
            not context.get("bpp_id") or not context.get("bpp_uri")
        ):
            raise ProtocolError("TDE status: provider identity required")
        order = payload.get("message", {}).get("order")
        if not isinstance(order, dict):
            if action == "status" and payload.get("message", {}).get("order_id"):
                return
            raise ProtocolError("TDE order: order is required")
        if action in {"status", "on_status"} and not order.get("id"):
            raise ProtocolError("TDE order: order id required")
        if action not in {"status", "on_status"} and not isinstance(order.get("items"), list):
            raise ProtocolError("TDE order: items are required")


def _is_transport_message(payload):
    intent = payload.get("message", {}).get("intent", {}) if isinstance(payload, dict) else {}
    fulfillment = intent.get("fulfillment", {}) if isinstance(intent, dict) else {}
    stops = fulfillment.get("stops", []) if isinstance(fulfillment, dict) else []
    return isinstance(stops, list) and {"START", "END"} <= {
        stop.get("type") for stop in stops if isinstance(stop, dict)
    }


def _is_experience_message(payload):
    fulfillment = payload.get("message", {}).get("intent", {}).get("fulfillment", {})
    return isinstance(fulfillment, dict) and fulfillment.get("type") == "EXPERIENCE"


def _validate_experience_search(payload):
    intent = payload.get("message", {}).get("intent", {})
    fulfillment = intent.get("fulfillment", {})
    destination = fulfillment.get("location", {}).get("descriptor", {}).get("name")
    start = fulfillment.get("start", {}).get("time", {}).get("range", {})
    if not destination or not start.get("start") or not start.get("end"):
        raise ProtocolError("TDE experience profile: destination and date range required")
    tags = {
        tag.get("descriptor", {}).get("code"): tag
        for tag in intent.get("tags", [])
        if isinstance(tag, dict)
    }
    entries = tags.get("NUM_PARTICIPANTS", {}).get("list", [])
    if not any(
        entry.get("descriptor", {}).get("code") == "COUNT"
        and str(entry.get("value", "")).isdigit()
        and 1 <= int(entry["value"]) <= 18
        for entry in entries
        if isinstance(entry, dict)
    ):
        raise ProtocolError("TDE experience profile: participant count required")


def _validate_hotel_search(payload):
    intent = payload.get("message", {}).get("intent", {})
    fulfillment = intent.get("fulfillment", {})
    location = fulfillment.get("location", {})
    destination = location.get("descriptor", {}).get("name") if isinstance(location, dict) else None
    start = fulfillment.get("start", {}).get("time", {}).get("range", {})
    end = fulfillment.get("end", {}).get("time", {}).get("range", {})
    if not destination or not start.get("start") or not end.get("end"):
        raise ProtocolError("TDE hotel profile: destination and stay interval required")
    tags = {
        tag.get("descriptor", {}).get("code"): tag
        for tag in intent.get("tags", [])
        if isinstance(tag, dict)
    }
    for code in ("ROOMS", "GUESTS"):
        entries = tags.get(code, {}).get("list", [])
        if not any(
            entry.get("descriptor", {}).get("code") == "COUNT" and str(entry.get("value", "")).isdigit()
            and int(entry["value"]) > 0
            for entry in entries
            if isinstance(entry, dict)
        ):
            raise ProtocolError("TDE hotel profile: " + code.lower() + " count required")


def ack(error=None):
    result = {"message": {"ack": {"status": "NACK" if error else "ACK"}}}
    if error:
        result["error"] = {"code": "30000", "message": str(error)}
    return result


def require_ack(response):
    try:
        body = response.json()
    except (ValueError, KeyError) as exc:
        raise ProtocolError("Invalid protocol ACK") from exc
    validate_schema(body, "search", response=True)
    if response.is_error or body.get("message", {}).get("ack", {}).get("status") != "ACK":
        detail = body.get("error", {}).get("message", "No rejection reason supplied")
        raise ProtocolError("Protocol request rejected: " + str(detail))
    return body
