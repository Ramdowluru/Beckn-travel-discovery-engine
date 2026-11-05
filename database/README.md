# TDE — Database Design (MongoDB)

Data layer for the **Beckn-Based Travel Discovery Engine** (SRS Module 4).
Stack is fixed by the SRS: **MongoDB** (persistence) + **Redis** (TTL cache — see *Caching Strategy*).

The schema models the Beckn transaction lifecycle: a **search** produces cached catalog results; a **confirm** persists an `Order` with denormalized item snapshots; every step is journaled for the ≥70% journey-completion KPI (SRS §3, §8).

ER diagram: [`docs/database-er-diagram.png`](../docs/database-er-diagram.png) · SVG source: [`docs/database-er-diagram.svg`](../docs/database-er-diagram.svg)

---

## Collections

### `users`
Consumer accounts (the SRS "Traveler" + "System Administrator" actors).

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `name` | String | required |
| `email` | String | required, **unique**, lowercase |
| `phone` | String | optional, sparse-unique |
| `passwordHash` | String | bcrypt; omitted for OTP-only accounts |
| `role` | Enum | `traveler` (default) / `admin` |
| `auth` | Object | `{ method: 'password'|'otp', lastLoginAt }` |
| `preferences` | Object | `{ homeCity, preferredModes: [], currency: 'INR' }` |
| `createdAt` / `updatedAt` | Date | timestamps |

### `providers` (SRS §12 "Providers")
Travel service providers, represented by adapters.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `providerId` | String | **unique** Beckn provider id (`bpp.com/providers/1`) |
| `name` | String | display name, e.g. "SkyConnect" |
| `category` | Enum | `transport` / `accommodation` / `experience` |
| `adapterEndpoint` | String | required — adapter service URL |
| `status` | Enum | `active` (default) / `inactive` |
| `rating` | Number | 0–5 |
| `descriptor` | Object | `{ longDescription, images: [], logo }` |
| `locations` | Array | `{ type: 'Point', coordinates: [lng, lat] }` — **2dsphere** for GIS (FR-11) |
| `ttl` | Object | `{ seconds: 300 }` — Beckn TTL for its catalog |
| `createdAt` / `updatedAt` | Date | |

### `catalogs` (SRS §12 "Catalog")
Normalized inventory items. Each item belongs to a provider, carries the common Beckn fields, and a category-specific payload.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `catalogId` | String | **unique** Beckn item id |
| `providerRef` | ObjectId → `providers` | required, indexed |
| `category` | Enum | `transport` / `accommodation` / `experience` |
| `descriptor` | Object | `{ name, shortDesc, longDesc, images: [] }` |
| `price` | Object | `{ value: Number, currency: 'INR', type: 'per-seat'|'per-night'|'per-person' }` |
| `availability` | Object | `{ status: 'available'|'sold_out'|'unavailable', seats/rooms/slots }` |
| `timing` | Object | departure/arrival or check-in/out or start time |
| `rating` | Object | `{ average, count }` |
| `location` | GeoJSON Point | **2dsphere** — for stays & experiences |
| `item` | Discriminator payload | one of `transportItem` / `accommodationItem` / `experienceItem` (below) |
| `tags` | Array&lt;String&gt; | e.g. `["WiFi","AC","Free cancellation"]` — powers filter UI |
| `ttl` | Object | Beckn TTL for cached pricing |
| `createdAt` / `updatedAt` | Date | |

**Discriminator payloads (stored in `item`):**
- `transportItem`: `{ mode: 'flight'|'train'|'bus', vehicleNumber, origin: {city, code, location}, destination: {…}, durationMinutes, stops }`
- `accommodationItem`: `{ propertyType, roomType, address, checkInTime, checkOutTime, amenities: [] }`
- `experienceItem`: `{ hostName, durationMinutes, meetingPoint: {address, location}, category, includes: [] }`

### `orders` (SRS §12 "Orders")
Immutable once `confirmed`; mutable only through the Beckn state machine.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `orderId` | String | **unique** Beckn order id |
| `userRef` | ObjectId → `users` | required, indexed |
| `transactionId` | String | Beckn `transaction_id`, indexed |
| `bppId` / `bppUri` | String | which provider adapter fulfilled it |
| `status` | Enum | `created → selected → initiated → confirmed → cancelled` (SRS §12); `completed` terminal state |
| `items` | Array | denormalized snapshots: `{ catalogId, descriptor, category, price, quantity, timing }` — frozen at confirm so later catalog price changes never mutate historical orders |
| `fulfillments` | Array | `{ id, type: 'departure'|'return'|'stay'|'activity', start: {time, location}, end: {…}, vehicle, stops }` |
| `quote` | Object | `{ price: {value, currency}, breakdown: [{title, price}], ttl }` |
| `payment` | Object | `{ type: 'ON-ORDER', status: 'paid'|'pending'|'refunded', txnRef, paidAmount }` |
| `cancellation` | Object | `{ reasonId, reason, cancelledBy, refundedAmount, refundStatus }` (null unless cancelled) |
| `providerReference` | String | provider's own booking reference |
| `timeline` | Array | audit trail: `{ status, at }` |
| `createdAt` / `updatedAt` | Date | |

**State transitions (enforced in model):**
`created → selected → initiated → confirmed` — forward only;
`confirmed → cancelled` allowed only within the provider's free-cancellation window; `cancelled` and `completed` are terminal.

### `userJourneys` (SRS §12 "User Journeys")
Analytics for the ≥70% search→booking completion KPI.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `journeyId` | String | unique |
| `userRef` | ObjectId → `users` | nullable for anonymous sessions |
| `sessionId` | String | indexed |
| `searchCriteria` | Object | `{ origin, destination, date, travellers, filtersUsed: [], category }` |
| `stepsCompleted` | Array&lt;Enum&gt; | `search` / `view_results` / `select` / `init` / `confirm` (SRS §12) |
| `outcome` | Enum | `completed` / `abandoned` (default `abandoned`) |
| `searchLatencyMs` | Number | feeds the <3 s KPI |
| `createdAt` / `updatedAt` | Date | |

### `providerCallbacks` (ops/monitoring)
Log of Beckn `on_*` callbacks for reliability monitoring (SRS §8: "log failed or late provider callbacks").

| Field | Type |
|---|---|
| `action` | Enum: `search` / `select` / `init` / `confirm` / `status` / `track` / `cancel` |
| `bppId` | String (indexed) |
| `transactionId` | String (indexed) |
| `status` | Enum: `received` / `late` / `failed` |
| `latencyMs` | Number |
| `payload` | Object (raw response, capped) |
| `receivedAt` | Date (TTL index: 30 days) |

---

## Relationships

```
users        1 ──── *  orders
users        1 ──── *  userJourneys
providers    1 ──── *  catalogs
catalogs     1 ──── *  orders.items[]        (denormalized snapshot, not a live FK)
providers    1 ──── *  providerCallbacks
```

Cross-collection references use the pattern `<entity>Ref` (ObjectId) + the Beckn string id is kept alongside (`orderId`, `catalogId`, `providerId`) so the API layer never needs a join to speak Beckn.

## Indexes

| Collection | Index | Purpose |
|---|---|---|
| `users` | `{ email: 1 }` unique | auth lookup |
| `providers` | `{ providerId: 1 }` unique | adapter routing |
| `providers` | `{ locations: '2dsphere' }` | GIS proximity queries (FR-11) |
| `catalogs` | `{ catalogId: 1 }` unique | select/quote lookup |
| `catalogs` | `{ category: 1, 'price.value': 1 }` | category browse + price sort (FR-5) |
| `catalogs` | `{ 'item.origin.city': 1, 'item.destination.city': 1, 'timing.departureTime': 1 }` | transport route+date search |
| `catalogs` | `{ location: '2dsphere' }` | GIS for stays/experiences |
| `catalogs` | `{ 'tags': 1 }` | amenity filtering |
| `orders` | `{ orderId: 1 }` unique | status/track/cancel |
| `orders` | `{ userRef: 1, createdAt: -1 }` | trips page |
| `orders` | `{ transactionId: 1 }` | Beckn txn correlation |
| `userJourneys` | `{ sessionId: 1 }`, `{ userRef: 1, createdAt: -1 }` | funnel analytics |
| `providerCallbacks` | `{ bppId: 1, receivedAt: -1 }`, `{ transactionId: 1 }` | monitoring; TTL `receivedAt` 30d |

## Caching Strategy (Redis — separate concern, no schema)

| Key pattern | TTL | Contents |
|---|---|---|
| `search:{hash(origin+dest+date+filters)}` | 60–300 s (provider `ttl`) | aggregated `on_search` results |
| `quote:{transactionId}` | 300 s | `on_select` quote awaiting confirm |
| `order:status:{orderId}` | 30 s | latest `on_status` snapshot |

Cache is always re-readable from MongoDB; it is safe to lose.

## Beckn Lifecycle ↔ Schema Mapping

| Beckn action | Schema effect |
|---|---|
| `search` → `on_search` | read catalogs (+ Redis cache); create `userJourneys` step `search` |
| `select` → `on_select` | fresh quote; `orders.status = selected` |
| `init` → `on_init` | `orders.status = initiated`, terms frozen |
| `confirm` → `on_confirm` | `orders.status = confirmed`, snapshots frozen, `payment` recorded |
| `status`/`track` → `on_status` | order read; `timeline` appended |
| `cancel` → `on_cancel` | `orders.status = cancelled`, `cancellation` filled |
