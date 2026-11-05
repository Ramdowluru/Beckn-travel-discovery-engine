[CmdletBinding()]
param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root "backend"
$providers = Join-Path $root "mock_providers"
$frontend = Join-Path $root "frontend"
$python = Join-Path $backend "venv\Scripts\python.exe"
$uvicorn = Join-Path $backend "venv\Scripts\uvicorn.exe"
$ports = [ordered]@{
    Frontend = 3000
    FastAPI = 8000
    Gateway = 9000
    Bus = 5001
    Train = 5002
    Flight = 5003
    Hotel = 5004
    Experiences = 5005
}

function Write-Step([string]$Message) {
    Write-Host "[start-dev] $Message" -ForegroundColor Cyan
}

function Get-PortOwner([int]$Port) {
    Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty OwningProcess
}

function Show-PortConflict([string]$Name, [int]$Port, [int]$ProcessId) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    Write-Host "[start-dev] $Name cannot start: port $Port is already used by PID $ProcessId." -ForegroundColor Red
    if ($process) {
        Write-Host "             $($process.CommandLine)" -ForegroundColor Yellow
    }
}

function Start-Terminal([string]$Title, [string]$WorkingDirectory, [string]$Command) {
    $escapedWorkingDirectory = $WorkingDirectory.Replace("'", "''")
    $terminalCommand = "`$Host.UI.RawUI.WindowTitle = '$Title'; Set-Location -LiteralPath '$escapedWorkingDirectory'; $Command"
    if ($DryRun) {
        Write-Host "[dry-run] $Title`: $Command"
        return
    }
    Start-Process powershell.exe -ArgumentList @(
        "-NoLogo",
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", $terminalCommand
    ) | Out-Null
}

function Wait-ForService([string]$Name, [int]$Port, [string]$Uri) {
    $deadline = (Get-Date).AddSeconds(20)
    do {
        Start-Sleep -Milliseconds 500
        try {
            $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                Write-Step "$Name is ready on localhost:$Port."
                return $true
            }
        } catch {
            # The bounded retry reports the failure below if readiness is not reached.
        }
    } while ((Get-Date) -lt $deadline)

    Write-Host "[start-dev] $Name did not become ready on localhost:$Port." -ForegroundColor Red
    return $false
}

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "Backend virtual environment Python was not found at $python."
}
if (-not (Test-Path -LiteralPath $uvicorn -PathType Leaf)) {
    throw "Backend Uvicorn executable was not found at $uvicorn."
}
if (-not (Test-Path -LiteralPath $frontend -PathType Container)) {
    throw "Frontend directory was not found at $frontend."
}

foreach ($entry in $ports.GetEnumerator()) {
    $owner = Get-PortOwner $entry.Value
    if ($owner) {
        Show-PortConflict $entry.Key $entry.Value $owner
        exit 1
    }
}

Write-Step "Preparing local Beckn signing identities..."
if (-not $DryRun) {
    & $python (Join-Path $root "scripts\provision_beckn_keys.py")
    if ($LASTEXITCODE -ne 0) { throw "Local Beckn identity provisioning failed." }
}
Write-Step "Launching gateway and providers..."
Start-Terminal "TDE Gateway :9000" $providers "& '$python' -m uvicorn mock_gateway.main:app --host localhost --port 9000"
Start-Terminal "TDE Bus :5001" $providers "& '$python' -m uvicorn mock_bus.main:app --host localhost --port 5001"
Start-Terminal "TDE Train :5002" $providers "& '$python' -m uvicorn mock_train.main:app --host localhost --port 5002"
Start-Terminal "TDE Flight :5003" $providers "& '$python' -m uvicorn mock_flight.main:app --host localhost --port 5003"
Start-Terminal "TDE Hotel :5004" $providers "& '$python' -m uvicorn mock_hotel.main:app --host localhost --port 5004"
Start-Terminal "TDE Experiences :5005" $providers "& '$python' -m uvicorn mock_experience.main:app --host localhost --port 5005"

if (-not $DryRun) {
    if (-not (Wait-ForService "Gateway" 9000 "http://localhost:9000/docs")) { exit 1 }
    if (-not (Wait-ForService "Bus provider" 5001 "http://localhost:5001/docs")) { exit 1 }
    if (-not (Wait-ForService "Train provider" 5002 "http://localhost:5002/docs")) { exit 1 }
    if (-not (Wait-ForService "Flight provider" 5003 "http://localhost:5003/docs")) { exit 1 }
    if (-not (Wait-ForService "Hotel provider" 5004 "http://localhost:5004/docs")) { exit 1 }
    if (-not (Wait-ForService "Experience provider" 5005 "http://localhost:5005/docs")) { exit 1 }
}

Write-Step "Launching FastAPI..."
$fastApiCommand = "`$env:GATEWAY_URL='http://localhost:9000'; `$env:BAP_URI='http://localhost:8000'; & '$uvicorn' app.main:app --host localhost --port 8000"
Start-Terminal "TDE FastAPI :8000" $backend $fastApiCommand

if (-not $DryRun) {
    if (-not (Wait-ForService "FastAPI" 8000 "http://localhost:8000/docs")) { exit 1 }
}

Write-Step "Launching Next.js..."
$frontendCommand = "`$env:BACKEND_URL='http://localhost:8000'; npm run dev -- --hostname localhost --port 3000"
Start-Terminal "TDE Frontend :3000" $frontend $frontendCommand

if (-not $DryRun) {
    if (-not (Wait-ForService "Next.js" 3000 "http://localhost:3000")) { exit 1 }
    Start-Process "http://localhost:3000" | Out-Null
    Write-Step "All services are ready. Opened http://localhost:3000."
} else {
    Write-Step "Dry run complete. No service windows were started."
}
