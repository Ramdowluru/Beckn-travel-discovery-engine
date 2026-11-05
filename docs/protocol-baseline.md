# Beckn protocol recovery baseline

The transport discovery recovery uses Beckn Core Transaction API v1.1.0,
pinned to commit
[`8479762c101c385125cd66ecb907817ed6bdd231`](https://github.com/beckn/protocol-specifications/tree/8479762c101c385125cd66ecb907817ed6bdd231).
The bundled source is
[`protocol/specs/core-v1.1.0.yaml`](../protocol/specs/core-v1.1.0.yaml).

The transport mapping is based on the historical mobility artifact
[`mobility-core1.1.yaml`](../protocol/specs/mobility-core1.1.yaml), sourced
from the official
[`beckn/mobility`](https://github.com/beckn/mobility) repository at commit
`020e56aba9777fa36724133e65fbad676882abe7`. The artifact identifies itself
as Mobility 0.8.3 and is treated as a compatibility reference, not as a
complete official profile for every travel category.

## Project policy

`TRV`, the `START`/`END` stop vocabulary, the traveller-count tag, the
provider-level relationship mapping, and the transport profile rules are
TDE conventions. They are not claimed to be official Beckn category
definitions.

The BAP and solicited `on_search` callback retain the same `transaction_id`
and `message_id` for one request/callback cycle. A new `message_id` is used
only for a new interaction, including an unsolicited callback.

Successful transport discovery, transport `select`/`on_select` quote
validation, `init`/`on_init` initialization, and `confirm`/`on_confirm`
confirmation are supported, along with whole-order `cancel`/`on_cancel`.
Each order action is sent directly to the
trusted BPP recorded in the discovery snapshot; the gateway is not used for
order actions. Providers re-read their own inventory and return signed
callbacks. The BAP persists each attempt before dispatch and stores validated
provider responses on user-owned records. Init returns the provider's final
quote and simulated payment terms. Confirm requires explicit acceptance of
that quote through the TDE `TDE_PRICE_ACCEPTANCE` tag. Confirmation is
provider-specific; separate provider orders are not atomic.

Status uses the pinned Core v1.1.0 `/status` contract (`message.order_id`) and
`/on_status` success (`message.order`) or error shape. It preserves the
booking's `transaction_id` and assigns a new `message_id` to each status
request/callback pair. Requests go directly to the trusted BPP. The provider
checks BAP and transaction ownership and reads its durable provider order;
status does not create orders or touch inventory. The BAP validates signatures,
trusted sender/address, correlation, provider order, item, fulfillment,
quantity, currency and quote before storing a response.

Selection and initialization do not reserve inventory. A provider atomically
checks current availability, confirms its initialized order, and deducts its
own inventory exactly once. Durable local SQLite stores are isolated by
provider identity. Transport inventory is scoped to service and departure
date, hotels to room type and each occupied night (excluding check-out), and
experiences to activity and its date/time slot. Discovery, selection and
initialization read these same runtime balances. Confirmed mock orders keep
payment status `NOT-PAID`; no payment API or card details are used.

BAP selection-attempt records retain the authenticated user, trusted BPP,
provider order, transaction/action correlation, accepted quote, fulfillment,
and validated confirmation callback snapshot. A unique partial index on
`(provider.id, providerOrder.id)` prevents one BPP order from being attached
to multiple BAP records while allowing attempts that have not initialized an
order. Provider databases are separate per BPP; each provider order identity
and its inventory deductions commit in one SQLite transaction. Compare-and-set
state updates prevent timeout/error handling from replacing a confirmed BAP
state. These constraints provide idempotency and safe status reconciliation:
a valid provider status showing the same accepted order as `CONFIRMED` can
resolve a pending confirmation without redispatching confirm or deducting
inventory again. An initialized status or provider error does not prove a
pending confirmation failed. Status refresh is authenticated, ownership-scoped,
CSRF-protected for browser writes, user-triggered and rate-limited to ten
requests per minute.

If dispatch or callback delivery times out, the BAP outcome remains pending
or unknown. A valid late correlated callback may resolve it; clients must not
blindly redispatch. If initialization is pending and no provider order ID has
been received, status cannot query the BPP; the UI reports that limitation.
Status cannot establish that an order was never created, and an unavailable or
unknown-order response does not fail a booking. Status refresh is a live provider
query; displayed BAP state changes only after a validated callback is persisted.

Cancellation follows the pinned Core v1.1.0 `/cancel` message (`order_id`,
optional `cancellation_reason_id` and `descriptor`) and `/on_cancel` response
(`message.order` or schema-valid `error`). The booking's `transaction_id` is
preserved; each cancellation gets a fresh `message_id` shared by its callback.
The BAP records a stable cancellation business key and callback correlation
before dispatch, requires an authenticated owner, CSRF, a reason and explicit
whole-order confirmation, and sends directly to the trusted BPP. Signed
callbacks are checked for trusted sender/address, correlation, provider order,
items, quantity, fulfillment, accepted quote, cancellation actor/reason and
unpaid payment terms. A lost callback remains pending/unknown; a subsequent
user-triggered status response may reconcile the same cancellation without
redispatching it. Stale confirmation/status callbacks cannot move a cancelled
booking backward.

TDE mock policy (not an official Beckn category rule): cancellation is allowed
only before transport departure, hotel check-in, or experience start. There is
no cancellation fee. Confirmed mock bookings are unpaid, so refund is not
applicable; no refund amount or real payment/refund operation is produced.
Providers persist the exact inventory allocations deducted at confirmation
alongside the provider-owned order. Cancellation restores only those saved
allocations in the same durable transaction that changes the provider order
to `CANCELLED`. The unique provider order and state guard make restoration
exactly-once across duplicate/concurrent requests. Existing pre-upgrade
confirmed provider orders with no saved allocation are rejected for
cancellation rather than reconstructing inventory from catalog defaults.

Selection attempts are owned by the authenticated BAP user and persisted
before dispatch. A stable business key (`transaction_id`, offer and quantity)
prevents a fresh `message_id` from creating an accidental duplicate attempt.
If the provider acknowledgement or callback times out, the attempt remains
`PENDING_PROVIDER`; callers must not blindly retry it. A later status
request can reconcile a pending confirmation once its provider order reference
is known; selection and initialization outcomes resolve through their
correlated callbacks.

## Customer details and booking presentation

The mock providers require passenger/guest/participant names and lead contact
name, email and phone. Hotels additionally require each guest's room
assignment and validate that assignment against provider room capacity.
Transport mock inventories do not require age, gender, class, boarding-point or
seat selections, so the prototype does not collect or fabricate those fields.
If a future trusted provider requires additional passenger attributes, they
must be added as provider-specific TDE conventions and validated at the BAP and
provider before dispatch.

Names and room assignments are carried in TDE-owned `TRAVELLERS`,
`TDE_GUESTS` and `TDE_PARTICIPANTS` tags; lead contact values use Beckn
`billing`. These are schema-compatible TDE conventions, not official category
profiles. Customer details are persisted with the user-owned BAP attempt for
booking review and management. They are never written to application logs.
The customer-facing booking detail and downloadable text voucher use the
persistent local attempt ID, not an expiring search snapshot or browser-local
selection key. A voucher is available only while its order is confirmed and
is labelled as an academic prototype, not valid for travel.

## Category coverage

- Bus, train and flight are represented by the TDE transport profile and
  independent mock-provider inventories. They support select/on_select,
  init/on_init, confirm/on_confirm, status/on_status and cancel/on_cancel.
- The official `beckn/open-tourism` repository is a tourism starting point,
  but its current material does not provide a verified v1 hotel or
  experiences profile for this project.
- Hotel discovery uses Core v1.1.0 with a TDE-owned accommodation mapping.
  The mapping uses `STAY` fulfillment, destination and stay interval fields,
  `ROOMS`/`GUESTS` intent tags, and nightly room pricing. These are project
  conventions, not an official Beckn tourism profile. Hotel callbacks use
  Core provider-level categories, locations, fulfillments, and item reference
  arrays. Select carries room count, guest count, destination, stay interval,
  room item and fulfillment references in the `TDE_HOTEL_BOOKING` tag.
  Initialization carries named guests, room assignments, contact details and
  quote expiry in TDE tags and Core billing/quote fields. The provider
  revalidates dates, room capacity and current pricing. The v2 hotel material
  in `beckn/open-tourism` is not used.
- Experience discovery uses Core v1.1.0 with a TDE-owned experience mapping:
  `EXPERIENCE` fulfillment, destination location, a date range, and a
  `NUM_PARTICIPANTS` count tag. Provider catalogs expose Core relationship
  references and item quantity. Select carries destination, date, participant
  count, item and fulfillment references in `TDE_EXPERIENCE_BOOKING`.
  Initialization carries named participants, contact details and quote
  expiry in TDE tags and Core billing/quote fields. The provider revalidates
  date, capacity and current pricing. This is not an official Beckn tourism
  profile, and no v2 open-tourism payload is used. The independent mock
  provider is available at `http://localhost:5005`.
- Hotel and experience providers persist orders and runtime inventory in
  separate provider-specific local SQLite databases. Their select, init,
  confirm, status and cancel requests are sent directly to the trusted BPP.
  Confirmation atomically decrements room-night or activity-slot availability;
  cancellation restores each originally allocated night or slot once.
  Check-out is not an occupied night. This category mapping and the
  acceptance/inventory tags are TDE conventions, not an official Beckn tourism
  profile.
- Hotel and experience status use the same Core v1.1.0 order_id/order
  structures as transport. Their category-specific item, stay interval or
  activity slot and quantity comparisons are TDE validation conventions, not
  official tourism-profile compliance.
- No complete official rail, flight or cross-category travel profile was
  verified beyond the pinned core and mobility compatibility references.

## Signing convention

Requests and callbacks sign the exact transmitted JSON bytes. The local
implementation uses Ed25519 and a BLAKE2b-512 digest labeled
`BLAKE-512=...`, matching the official
[ONDC signing reference](https://github.com/ONDC-Official/developer-docs/blob/main/registry/signing-verification.md)
and its
[Python reference implementation](https://github.com/ONDC-Official/reference-implementations/blob/main/utilities/signing_and_verification/python/cryptic_utils.py).

Direct subscriber requests use `Authorization`. Gateway-forwarded requests
retain the originator's `Authorization` and add a gateway-generated
`X-Gateway-Authorization`. Providers verify both signatures.
