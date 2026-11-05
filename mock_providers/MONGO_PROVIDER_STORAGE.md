# Provider Mongo storage preparation

MongoDB is now the active store for all five providers when launched by
`start-dev.ps1`. The Mongo adapter is selected through provider-specific
selectors such as `MOCK_BUS_STORAGE_BACKEND=mongodb`,
`MOCK_TRAIN_STORAGE_BACKEND=mongodb`, `MOCK_FLIGHT_STORAGE_BACKEND=mongodb`,
`MOCK_HOTEL_STORAGE_BACKEND=mongodb`, or
`MOCK_EXPERIENCE_STORAGE_BACKEND=mongodb`;
connection settings are read from the selected provider environment as
`PROVIDER_MONGO_URL` and `PROVIDER_DB_NAME`.
Each provider's private `.env` supplies `PROVIDER_MONGO_URL` and
`PROVIDER_DB_NAME`; the launcher scopes those values to that provider process.
Once selected, Mongo configuration, connectivity, missing catalog
records, and unsupported transactions fail closed; there is no SQLite fallback.

The adapter expects these collections in the configured provider database:

- `providers`: `_id` is the exact BPP ID; `provider` contains the existing
  provider object.
- `services`: `providerBppId`, `_id` and `service_id` retain exact provider and
  item IDs; service fields retain the converter's existing snake-case names.
  Store `price.amount` as BSON `Decimal128`, not a binary float.
- `inventory`: `_id` retains the runtime resource key. Experience keys may be
  `experience:<service_id>:<YYYY-MM-DD>:<HH:MM>` and include `slot`; fields
  `providerBppId`, `serviceId`, `serviceDate`, `available`, and
  `initialCapacity` are retained. The unique identity index includes
  `providerBppId`, `serviceId`, `serviceDate`, and optional `slot`, so legacy
  records without a slot remain valid while multiple experience slots coexist.
  Existing date balances are never reset from catalog data.
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

## Migration command

The importer is dry-run by default and does not connect to MongoDB in that mode:

```powershell
.\backend\venv\Scripts\python.exe .\mock_providers\scripts\provider_mongo_import.py `
  --catalog .\mock_providers\mock_bus\data.json `
  --sqlite .\.local\providers\mock-busexamplein.sqlite3
```

After approval, stop provider writes and run the same command with the approved
target values and `--apply`. The SQLite backup is created before the first
MongoDB write:

```powershell
.\backend\venv\Scripts\python.exe .\mock_providers\scripts\provider_mongo_import.py `
  --catalog .\mock_providers\mock_bus\data.json `
  --sqlite .\.local\providers\mock-busexamplein.sqlite3 `
  --mongo-uri $env:PROVIDER_MONGO_URL `
  --database $env:PROVIDER_DB_NAME `
  --backup-dir .\.local\providers\backups `
  --apply
```

Do not paste or print the URI. The command uses a source-fingerprint ledger,
transactional inserts, exact-record comparison, and post-write verification.
An identical rerun skips records. Any changed source or conflicting target
record aborts without overwriting it. The five flagged records are imported
with separate warning documents and mutation blocks.

For an approved TrainProvider import, use the train source paths and private
train environment values:

```powershell
.\backend\venv\Scripts\python.exe .\mock_providers\scripts\provider_mongo_import.py `
  --catalog .\mock_providers\mock_train\data.json `
  --sqlite .\.local\providers\mock-trainexamplein.sqlite3 `
  --mongo-uri $env:PROVIDER_MONGO_URL `
  --database $env:PROVIDER_DB_NAME `
  --backup-dir .\.local\providers\backups `
  --apply
```

Run it from a process that has loaded `mock_providers/mock_train/.env`; keep
the Mongo selector unset until the import has been verified.

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

For TrainProvider, use `mock_providers/mock_train/data.json`,
`.local/providers/mock-trainexamplein.sqlite3`, and
`mock-train.example.in` with the same dry-run/import commands. The adapter
preserves train service IDs and fields without treating them as BusProvider
records.

No Atlas write or runtime cutover is performed by the dry-run or adapter tests.
