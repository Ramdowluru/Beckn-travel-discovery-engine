# Local Beckn mock services

Run each service from the repository root in a separate terminal. The commands
use the repository's backend virtual environment and keep the local topology
consistent:

1. Start the gateway on port `9000`:

   ```powershell
   Set-Location .\mock_providers
   ..\backend\venv\Scripts\python.exe -m uvicorn mock_gateway.main:app --host 127.0.0.1 --port 9000
   ```

2. Start the independent providers:

   ```powershell
   Set-Location .\mock_providers
   ..\backend\venv\Scripts\python.exe -m uvicorn mock_bus.main:app --host 127.0.0.1 --port 5001
   ```

   ```powershell
   Set-Location .\mock_providers
   ..\backend\venv\Scripts\python.exe -m uvicorn mock_train.main:app --host 127.0.0.1 --port 5002
   ```

   ```powershell
   Set-Location .\mock_providers
   ..\backend\venv\Scripts\python.exe -m uvicorn mock_flight.main:app --host 127.0.0.1 --port 5003
   ```

   ```powershell
   Set-Location .\mock_providers
   ..\backend\venv\Scripts\python.exe -m uvicorn mock_hotel.main:app --host 127.0.0.1 --port 5004
   ```

   ```powershell
   Set-Location .\mock_providers
   ..\backend\venv\Scripts\python.exe -m uvicorn mock_experience.main:app --host 127.0.0.1 --port 5005
   ```

   The independent experience provider is available at
   `http://localhost:5005/docs` and owns `mock_experience/data.json`. It uses
   the TDE experience conventions documented in
   `docs/protocol-baseline.md`; it is not an official tourism profile.

3. Start FastAPI on port `8000`, pointing its gateway at port `9000` and its
   callback URI at port `8000`:

   ```powershell
   Set-Location .\backend
   $env:GATEWAY_URL="http://127.0.0.1:9000"
   $env:BAP_URI="http://127.0.0.1:8000"
   .\venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000
   ```

4. Start Next.js on port `3000` with the server-side backend URL:

   ```powershell
   Set-Location .\frontend
   $env:BACKEND_URL="http://127.0.0.1:8000"
   npm run dev -- --hostname 127.0.0.1 --port 3000
   ```

Each provider reads only its own `data.json` inventory and posts callbacks to
the BAP URI in the search context. The gateway fans out independently, so a
provider connection failure does not cancel requests to healthy providers.

The hotel provider accepts a hotel intent containing `to` as the destination,
`check_in`, `check_out`, `rooms`, and `guests`. It returns an asynchronous
`POST /api/on_search` callback using the same Beckn envelope as transport:
`context.transaction_id` is copied for correlation, `context.action` is
`on_search`, and `message.catalog.providers[0].items` contains one item per
eligible room type. Each item includes a provider/property/room-scoped ID,
room capacity and availability, requested dates/counts, nightly per-room
price, currency, hotel metadata, amenities, and images.

Hotel JSON availability seeds each provider's durable room-night inventory.
Discovery and selection read the runtime provider-owned balance; initialization
does not reserve rooms. A successful `confirm`/`on_confirm` atomically deducts
rooms for every occupied night (the check-out date is excluded). Experiences
are similarly scoped to their date/time slot, and transport to service and
departure date. Runtime state is stored in each provider's local SQLite
database under `.local/providers`; restarts retain confirmations and balances.
Confirmed mock orders remain unpaid; no payment is collected.
