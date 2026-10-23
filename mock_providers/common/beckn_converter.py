from datetime import date, datetime, time, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
EXTRA_FIELDS = ["bus_type", "train_number", "class", "flight_number", "cabin"]


def parse_search(payload: dict) -> tuple[str, str, date]:
    fulfillment = payload["message"]["intent"]["fulfillment"]
    names = {
        stop["type"]: stop["location"]["descriptor"]["name"]
        for stop in fulfillment["stops"]
    }
    time_range = fulfillment.get("start", {}).get("time", {}).get("range", {})
    start = time_range.get("start")
    travel_date = date.fromisoformat(start[:10]) if start else datetime.now(IST).date()
    return names["START"], names["END"], travel_date


def match_services(services: list[dict], origin: str, destination: str) -> list[dict]:
    origin, destination = origin.strip().lower(), destination.strip().lower()
    return [
        s for s in services
        if s["from"]["city"].lower() == origin and s["to"]["city"].lower() == destination
    ]

def to_utc(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def to_item(service: dict, travel_date: date) -> dict:
    hour, minute = map(int, service["departure_time"].split(":"))
    start = datetime.combine(travel_date, time(hour, minute), tzinfo=IST)
    end = start + timedelta(minutes=service["duration_minutes"])

    tags = [
        {
            "descriptor": {"code": "SERVICE_TYPE"},
            "list": [{"descriptor": {"code": "TYPE"}, "value": service["mode"]}],
        }
    ]
    details = [
        {"descriptor": {"code": field.upper()}, "value": str(service[field])}
        for field in EXTRA_FIELDS
        if field in service
    ]
    if details:
        tags.append({"descriptor": {"code": "SERVICE_DETAILS"}, "list": details})

    return {
        "id": service["service_id"],
        "descriptor": {"name": service["name"]},
        "category_id": service["mode"],
        "fulfillment": {
            "type": "ROUTE",
            "start": {
                "location": {"descriptor": {"name": service["from"]["city"]}},
                "time": {"timestamp": to_utc(start)},
            },
            "end": {
                "location": {"descriptor": {"name": service["to"]["city"]}},
                "time": {"timestamp": to_utc(end)},
            },
        },
        "price": {
            "currency": service["price"]["currency"],
            "value": f"{service['price']['amount']:.2f}",
        },
        "quantity": {"available": {"count": service["seats_available"]}},
        "tags": tags,
    }


def build_on_search(data: dict, request: dict) -> dict:
    provider = data["provider"]
    origin, destination, travel_date = parse_search(request)
    matches = match_services(data["services"], origin, destination)

    cities = {}
    for service in matches:
        for end in ("from", "to"):
            cities[service[end]["code"]] = service[end]["city"]

    context = {
        **request["context"],
        "action": "on_search",
        "bpp_id": provider["bpp_id"],
        "bpp_uri": provider["bpp_uri"],
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    return {
        "context": context,
        "message": {
            "catalog": {
                "descriptor": {"name": "Travel Search Results"},
                "providers": [
                    {
                        "id": provider["id"],
                        "descriptor": {"name": provider["name"]},
                        "locations": [
                            {"id": code, "descriptor": {"name": city}}
                            for code, city in cities.items()
                        ],
                        "items": [to_item(s, travel_date) for s in matches],
                    }
                ],
            }
        },
    }