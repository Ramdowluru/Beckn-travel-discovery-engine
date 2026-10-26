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
