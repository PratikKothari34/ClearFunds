# Launch everything needed to show ClearFunds on localhost.
#
# Right-click -> "Run with PowerShell", or from a prompt:
#   .\start.ps1
#
# Brings up Docker, Supabase and the Vite dev server, seeds the demo society
# if the database is empty, then opens the browser. Safe to re-run: it skips
# whatever is already up and never re-seeds over existing data.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$app  = 'http://localhost:5173/'
$api  = 'http://127.0.0.1:54321/rest/v1/'

function Up([string]$url) {
  try { (Invoke-WebRequest $url -TimeoutSec 4 -UseBasicParsing).StatusCode -ge 200 }
  catch { $false }
}

function WaitFor([string]$url, [int]$seconds, [string]$label) {
  for ($i = 0; $i -lt $seconds; $i++) {
    if (Up $url) { Write-Host "  $label is up" -ForegroundColor Green; return $true }
    Start-Sleep -Seconds 1
  }
  Write-Host "  $label did not come up after ${seconds}s" -ForegroundColor Red
  return $false
}

Write-Host "`nClearFunds - local demo`n" -ForegroundColor Cyan

# --- 1. Docker ---------------------------------------------------------------
# Supabase runs in containers, so the daemon has to answer first. Without this
# check the CLI fails with a connection error that reads like a Supabase fault.
Write-Host "[1/4] Docker"
docker ps *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "  starting Docker Desktop (this takes a minute on a cold boot)"
  $exe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
  if (Test-Path $exe) { Start-Process $exe } else { Write-Host "  not found at $exe" -ForegroundColor Red; exit 1 }
  for ($i = 0; $i -lt 180; $i++) {
    docker ps *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  if ($LASTEXITCODE -ne 0) { Write-Host "  Docker did not start" -ForegroundColor Red; exit 1 }
}
Write-Host "  Docker is up" -ForegroundColor Green

# --- 2. Supabase -------------------------------------------------------------
Write-Host "[2/4] Supabase"
if (Up $api) {
  Write-Host "  already up" -ForegroundColor Green
} else {
  Push-Location "$root\backend"
  npx supabase start | Out-Null
  Pop-Location
  if (-not (WaitFor $api 90 'Supabase')) { exit 1 }
}

# --- 3. Seed -----------------------------------------------------------------
# Only when the chain is empty. Re-seeding a populated database would append a
# second society, so the count is the guard, not a flag.
Write-Host "[3/4] Demo data"
# `postgres` is the Supabase CLI's fixed password for the LOCAL container - it
# is not a secret and is the same on every machine. It is still scoped to this
# one psql call and restored afterwards, rather than left in the shell: a
# PGPASSWORD surviving the script would then apply to every later psql the
# user runs, including one against a real database.
$prevPg = $env:PGPASSWORD
$rows = $null
try {
  $env:PGPASSWORD = 'postgres'
  $rows = (psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -tAc `
    "select count(*) from chain_entries;" 2>$null).Trim()
} catch { } finally { $env:PGPASSWORD = $prevPg }

if ($rows -and [int]$rows -gt 0) {
  Write-Host "  $rows ledger entries already seeded" -ForegroundColor Green
} else {
  if (Get-Command deno -ErrorAction SilentlyContinue) {
    Write-Host "  seeding Gulmohar Heights (takes about a minute)"
    Push-Location "$root\backend"
    deno run -A scripts/seed.ts | Out-Null
    Pop-Location
    Write-Host "  seeded" -ForegroundColor Green
  } else {
    Write-Host "  deno not installed - skipping seed; the app will load but be empty" -ForegroundColor Yellow
  }
}

# --- 4. Vite -----------------------------------------------------------------
# Started detached in its own window, so closing this one leaves it serving.
Write-Host "[4/4] Dev server"
if (Up $app) {
  Write-Host "  already up" -ForegroundColor Green
} else {
  if (-not (Test-Path "$root\frontend\node_modules")) {
    Write-Host "  installing dependencies (first run only)"
    Push-Location "$root\frontend"; npm install | Out-Null; Pop-Location
  }
  Start-Process cmd.exe -ArgumentList '/c npm run dev' -WorkingDirectory "$root\frontend" -WindowStyle Minimized
  if (-not (WaitFor $app 60 'Dev server')) { exit 1 }
}

# --- Ready -------------------------------------------------------------------
Write-Host "`n  App     $app"
Write-Host "  Studio  http://127.0.0.1:54323"
Write-Host "  Mail    http://127.0.0.1:54324`n"
Write-Host "  Sign in with the role buttons on the page - no email or OTP needed.`n" -ForegroundColor Cyan

Start-Process $app
