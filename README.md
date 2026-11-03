# Beckn Travel Discovery Engine

## Team Members
- Sriram Dowluru
- Member 2
- Member 3
- Member 4
- Member 5

## Problem Statement
Develop a Beckn-based Travel Discovery Engine that aggregates travel services from multiple providers using the Beckn Protocol.

## Tech Stack

### Frontend
- Next.js
- TypeScript (optional)
- Tailwind CSS (if you plan to use it)

### Backend
- FastAPI
- Python
- Pydantic
- Uvicorn

### Database
- MongoDB

### APIs & Documentation
- REST APIs
- OpenAPI / Swagger

### Version Control
- Git
- GitHub

## Project Status
🚧 Under Development
# Local development launcher

Double-click [`start-dev.cmd`](./start-dev.cmd) from File Explorer, or run
`.\start-dev.cmd` from PowerShell. The launcher resolves paths from its own
location, checks ports before starting, opens one terminal per service, waits
for readiness, and opens `http://localhost:3000` only after all seven services
are ready.

The services use this local topology:

| Service | Address |
| --- | --- |
| Next.js | `http://localhost:3000` |
| FastAPI | `http://localhost:8000` |
| Beckn gateway | `http://localhost:9000` |
| Bus provider | `http://localhost:5001` |
| Train provider | `http://localhost:5002` |
| Flight provider | `http://localhost:5003` |
| Hotel provider | `http://localhost:5004` |

To stop development, close the seven service terminal windows. The launcher
never terminates an existing process when a required port is occupied; it
reports the owning PID and stops instead.

For a non-starting validation of the launcher, run:

```powershell
.\start-dev.ps1 -DryRun
```

Transport search results are stored as anonymous, callback-derived snapshots
for detail-page retrieval. They expire after 15 minutes by default; the
backend setting `TRANSPORT_SNAPSHOT_TTL_SECONDS` can override that duration.
Snapshots are not user-owned itineraries and are not booking records.

Authenticated users can save the current transport draft to their account.
Saved itineraries copy the authoritative offer and search context and remain
available after the anonymous source snapshot expires. Their prices are saved
estimates and must be revalidated before booking; checkout is not enabled.

Authentication session configuration uses these variable names:
`MONGO_URL`, `DB_NAME`, `GATEWAY_URL`, `BAP_ID`, `BAP_URI`,
`SESSION_LIFETIME_SECONDS`, and `TRUSTED_ORIGINS`. The frontend BFF uses
`BACKEND_URL`. Keep their values in local environment configuration and do not
commit them.

The pinned Beckn recovery baseline and category limitations are documented in
[`docs/protocol-baseline.md`](./docs/protocol-baseline.md).
