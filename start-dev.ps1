[CmdletBinding()]
param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root "backend"
$providers = Join-Path $root "mock_providers"
$frontend = Join-Path $root "frontend"
$busEnvFile = Join-Path $providers "mock_bus\.env"
$trainEnvFile = Join-Path $providers "mock_train\.env"
$flightEnvFile = Join-Path $providers "mock_flight\.env"
$hotelEnvFile = Join-Path $providers "mock_hotel\.env"
$experienceEnvFile = Join-Path $providers "mock_experience\.env"
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

function Start-Terminal([string]$Title, [string]$WorkingDirectory, [string]$Command, [switch]$Sensitive) {
    $escapedWorkingDirectory = $WorkingDirectory.Replace("'", "''")
    $terminalCommand = "`$Host.UI.RawUI.WindowTitle = '$Title'; Set-Location -LiteralPath '$escapedWorkingDirectory'; $Command"
    if ($DryRun) {
        if ($Sensitive) {
            Write-Host "[dry-run] ${Title}: configured with private settings"
        } else {
            Write-Host "[dry-run] $Title`: $Command"
        }
        return
    }
    Start-Process powershell.exe -ArgumentList @(
        "-NoLogo",
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", $terminalCommand
    ) | Out-Null
}

function Read-RequiredDotEnvValue([string]$Path, [string]$Name, [string]$ProviderName) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Required $ProviderName environment file was not found at $Path."
    }
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match "^\s*$Name\s*=\s*(.*)\s*$") {
            $value = $Matches[1].Trim()
            if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
                $value = $value.Substring(1, $value.Length - 2)
            } elseif ($value.Length -ge 2 -and $value.StartsWith("'") -and $value.EndsWith("'")) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            if (-not [string]::IsNullOrWhiteSpace($value)) {
                return $value
            }
            throw "Required $ProviderName setting $Name is empty in $Path."
        }
    }
    throw "Required $ProviderName setting $Name is missing from $Path."
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

$providerMongoUrl = Read-RequiredDotEnvValue $busEnvFile "PROVIDER_MONGO_URL" "BusProvider"
$providerDbName = Read-RequiredDotEnvValue $busEnvFile "PROVIDER_DB_NAME" "BusProvider"
$trainMongoUrl = Read-RequiredDotEnvValue $trainEnvFile "PROVIDER_MONGO_URL" "TrainProvider"
$trainDbName = Read-RequiredDotEnvValue $trainEnvFile "PROVIDER_DB_NAME" "TrainProvider"
$flightMongoUrl = Read-RequiredDotEnvValue $flightEnvFile "PROVIDER_MONGO_URL" "FlightProvider"
$flightDbName = Read-RequiredDotEnvValue $flightEnvFile "PROVIDER_DB_NAME" "FlightProvider"
$hotelMongoUrl = Read-RequiredDotEnvValue $hotelEnvFile "PROVIDER_MONGO_URL" "HotelProvider"
$hotelDbName = Read-RequiredDotEnvValue $hotelEnvFile "PROVIDER_DB_NAME" "HotelProvider"
$experienceMongoUrl = Read-RequiredDotEnvValue $experienceEnvFile "PROVIDER_MONGO_URL" "ExperienceProvider"
$experienceDbName = Read-RequiredDotEnvValue $experienceEnvFile "PROVIDER_DB_NAME" "ExperienceProvider"

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
$escapedProviderMongoUrl = $providerMongoUrl.Replace("'", "''")
$escapedProviderDbName = $providerDbName.Replace("'", "''")
$escapedTrainMongoUrl = $trainMongoUrl.Replace("'", "''")
$escapedTrainDbName = $trainDbName.Replace("'", "''")
$escapedFlightMongoUrl = $flightMongoUrl.Replace("'", "''")
$escapedFlightDbName = $flightDbName.Replace("'", "''")
$escapedHotelMongoUrl = $hotelMongoUrl.Replace("'", "''")
$escapedHotelDbName = $hotelDbName.Replace("'", "''")
$escapedExperienceMongoUrl = $experienceMongoUrl.Replace("'", "''")
$escapedExperienceDbName = $experienceDbName.Replace("'", "''")
$busCommand = "`$env:MOCK_BUS_STORAGE_BACKEND='mongodb'; `$env:PROVIDER_MONGO_URL='$escapedProviderMongoUrl'; `$env:PROVIDER_DB_NAME='$escapedProviderDbName'; & '$python' -m uvicorn mock_bus.main:app --host localhost --port 5001"
Start-Terminal "TDE Bus :5001" $providers $busCommand -Sensitive
$trainCommand = "`$env:MOCK_TRAIN_STORAGE_BACKEND='mongodb'; `$env:PROVIDER_MONGO_URL='$escapedTrainMongoUrl'; `$env:PROVIDER_DB_NAME='$escapedTrainDbName'; & '$python' -m uvicorn mock_train.main:app --host localhost --port 5002"
Start-Terminal "TDE Train :5002" $providers $trainCommand -Sensitive
$flightCommand = "`$env:MOCK_FLIGHT_STORAGE_BACKEND='mongodb'; `$env:PROVIDER_MONGO_URL='$escapedFlightMongoUrl'; `$env:PROVIDER_DB_NAME='$escapedFlightDbName'; & '$python' -m uvicorn mock_flight.main:app --host localhost --port 5003"
Start-Terminal "TDE Flight :5003" $providers $flightCommand -Sensitive
$hotelCommand = "`$env:MOCK_HOTEL_STORAGE_BACKEND='mongodb'; `$env:PROVIDER_MONGO_URL='$escapedHotelMongoUrl'; `$env:PROVIDER_DB_NAME='$escapedHotelDbName'; & '$python' -m uvicorn mock_hotel.main:app --host localhost --port 5004"
Start-Terminal "TDE Hotel :5004" $providers $hotelCommand -Sensitive
$experienceCommand = "`$env:MOCK_EXPERIENCE_STORAGE_BACKEND='mongodb'; `$env:PROVIDER_MONGO_URL='$escapedExperienceMongoUrl'; `$env:PROVIDER_DB_NAME='$escapedExperienceDbName'; & '$python' -m uvicorn mock_experience.main:app --host localhost --port 5005"
Start-Terminal "TDE Experiences :5005" $providers $experienceCommand -Sensitive

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
