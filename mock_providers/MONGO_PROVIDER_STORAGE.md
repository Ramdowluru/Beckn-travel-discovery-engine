# BusProvider Mongo storage preparation

SQLite remains the active BusProvider store. The Mongo adapter is opt-in only
through `MOCK_BUS_STORAGE_BACKEND=mongodb`; its connection settings are read
from the provider environment as `PROVIDER_MONGO_URL` and `PROVIDER_DB_NAME`.
Do not set the selector or import data until the migration is separately
approved. Once selected, Mongo configuration, connectivity, missing catalog
records, and unsupported transactions fail closed; there is no SQLite fallback.

The adapter expects these collections in the configured provider database:

- `providers`: `_id` is the exact BPP ID; `provider` contains the existing
  provider object.
- `services`: `providerBppId`, `_id` and `service_id` retain exact provider and
  item IDs; service fields retain the converter's existing snake-case names.
  Store `price.amount` as BSON `Decimal128`, not a binary float.
- `inventory`: `_id` retains `transport:<service_id>:<YYYY-MM-DD>`; fields
  `providerBppId`, `serviceId`, `serviceDate`, `available`, and
  `initialCapacity`. Existing date balances are never reset from catalog data.
- `provider_orders`: `_id` is the exact existing order ID. `order` is the
  unchanged Beckn order object; `transactionId`, `initMessageId`, `bapId`,
  `state`, action message IDs, and immutable `inventoryAllocations` retain
  ownership and recovery data. Historical unsafe records use both
  `historicalUnsafe: true` and `mutationBlocked: true`.
- `provider_actions`: a unique provider/transaction/BAP/action/message key,
  request hash, and result document make action retries idempotent.
- `provider_migration_warnings`: migration warnings are recorded independently
  from provider orders and linked to exact provider order IDs. Confirmation
  and cancellation consult these records within their transaction, so an
  unsafe historical warning blocks mutation even if an order's inline marker
  is absent.

## Read-only dry-run

Run from the repository root; the command opens SQLite in read-only mode and
does not connect to MongoDB:

```powershell
.\backend\venv\Scripts\python.exe .\mock_providers\scripts\provider_mongo_dry_run.py `
  --catalog .\mock_providers\mock_bus\data.json `
  --sqlite .\.local\providers\mock-busexamplein.sqlite3
```

Nonzero exit means warnings or conflicts need explicit review. Anonymous `Rnn`
labels in the report identify records for the current deterministic order sort;
they do not disclose provider order IDs or payload content. Records with
missing BAP ownership or confirmed allocations must be preserved, separately
warned, and blocked from ownership-sensitive mutations. Do not assign a BAP ID
or rebuild allocations from present-day availability or catalog capacity.

## Approval, backup, rerun and rollback

1. Obtain explicit approval for importing this provider's data and separately
   approving a runtime cutover. Confirm the target database is the intended
   provider database and has transaction-capable topology.
2. Stop BusProvider writes. Copy the SQLite database and `data.json` to
   timestamped, access-controlled backups; verify both copies and record their
   hashes. Keep the originals unchanged.
3. Run the dry-run against those exact inputs. Resolve every conflict and
   review every warning. Do not import if source hashes/counts change.
4. An importer must use a migration ledger keyed by provider and both source
   hashes. A rerun with matching hashes verifies byte-equivalent target
   documents; a mismatch or conflicting target `_id` aborts without replacing
   documents. It must write the five flagged records as historical/blocked and
   warnings into the separate warning collection. It must not infer ownership
   or allocations.
5. Compare catalog IDs/prices, order IDs/states/ownership/correlations,
   allocation records, and every inventory key and balance before any
   cutover. Require the focused tests below against an isolated replica set.
6. Before Mongo runtime writes begin, rollback is to restore the previous
   SQLite selector and verified SQLite backup. After Mongo writes begin,
   quiesce the provider and reconcile or reverse-sync Mongo writes first; do
   not simply switch back to stale SQLite state.

No importer, Atlas write, or runtime cutover is included in this change.
