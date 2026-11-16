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
Write-Host "[1/5] Docker"
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
Write-Host "[2/5] Supabase"
if (Up $api) {
  Write-Host "  already up" -ForegroundColor Green
} else {
  Push-Location "$root\backend"
  npx supabase start | Out-Null
  Pop-Location
  if (-not (WaitFor $api 90 'Supabase')) { exit 1 }
}

# --- 3. Frontend environment -------------------------------------------------
# A fresh clone has NO .env.local: the file is gitignored (`*.local`), so it
# does not survive a clone while `.env.example` ships with the publishable key
# and the demo-login flag both EMPTY. Without this step the script brings
# Docker, Supabase and Vite up, opens the browser, and the app mounts unable
# to reach Supabase and with no quick-login buttons - the blank-page symptom
# again, in a new place, on the one machine a demo runs from.
#
# The values come from the running stack rather than being hardcoded, and they
# are the Supabase CLI's fixed LOCAL dev values - identical on every machine
# and not secrets. VITE_DEMO_LOGINS is what puts the per-role buttons on the
# sign-in page; a production build never carries them.
Write-Host "[3/5] Frontend environment"
$envFile = "$root\frontend\.env.local"
if (Test-Path $envFile) {
  Write-Host "  .env.local already present" -ForegroundColor Green
} else {
  # Push-Location, not `npx --prefix`: --prefix sets where npx RESOLVES the
  # package, not the working directory, and the Supabase CLI derives its
  # project name (and so its container names) from the directory it runs in.
  # From the repo root it looked for `supabase_db_ClearFunds` and failed, while
  # the real containers are `supabase_db_clearfunds`, created from `backend`.
  # The CLI prints deprecation WARNs to stderr before the JSON. In PowerShell
  # 5.1 a native command's stderr becomes an ErrorRecord (NativeCommandError)
  # that aborts the script even though the exit code is 0, so the stream is
  # merged into stdout and the JSON picked out of the result rather than
  # suppressed with `2>$null`, which does not stop the ErrorRecord.
  Push-Location "$root\backend"
  $raw = (& cmd.exe /c "npx supabase status -o json 2>&1") | Out-String
  Pop-Location
  # Everything from the first '{' to the last '}', NOT the first line that
  # starts with '{': piped through cmd.exe the CLI pretty-prints the JSON over
  # many lines, so a single-line match yields the bare opening brace and
  # ConvertFrom-Json fails with "':' or '}' expected".
  $open = $raw.IndexOf('{')
  $close = $raw.LastIndexOf('}')
  $status = if ($open -ge 0 -and $close -gt $open) { $raw.Substring($open, $close - $open + 1) } else { '' }
  $key = $null
  try { $key = ($status | ConvertFrom-Json).PUBLISHABLE_KEY } catch { }
  if (-not $key) {
    Write-Host "  could not read the publishable key from supabase status" -ForegroundColor Red
    Write-Host "  copy frontend\.env.example to frontend\.env.local and fill it in by hand" -ForegroundColor Yellow
    exit 1
  }
  # UTF8 WITHOUT a BOM: Vite reads .env as bytes, and a BOM becomes part of the
  # FIRST key's name, so VITE_SUPABASE_URL silently arrives as undefined.
  # The ORIGIN, not $api - $api carries the /rest/v1/ path used for health
  # checks, and the client appends its own paths, so passing it through would
  # produce /rest/v1/rest/v1/... on every call.
  $origin = ($api -replace '/rest/v1/?$', '')
  $lines = @(
    "# Written by start.ps1 from the running local Supabase stack.",
    "# Gitignored by frontend/.gitignore (*.local), so it does not survive a",
    "# clone - delete it and re-run start.ps1 to regenerate, which is also the",
    "# fix after `supabase stop` reissues the stack's keys.",
    "# Every value here is PUBLIC: it compiles into the bundle a browser",
    "# downloads. The signing keys are server-held; the frontend holds none.",
    "",
    "VITE_SUPABASE_URL=$origin",
    "VITE_SUPABASE_PUBLISHABLE_KEY=$key",
    "VITE_ANCHOR_URL=",
    "VITE_DEMO_LOGINS=1"
  )
  [IO.File]::WriteAllLines($envFile, $lines, (New-Object Text.UTF8Encoding $false))
  Write-Host "  wrote frontend\.env.local with the local stack's values" -ForegroundColor Green
}

# --- 4. Seed -----------------------------------------------------------------
# Only when the chain is empty. Re-seeding a populated database would append a
# second society, so the count is the guard, not a flag.
Write-Host "[4/5] Demo data"
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

# --- 5. Vite -----------------------------------------------------------------
# Started detached in its own window, so closing this one leaves it serving.
Write-Host "[5/5] Dev server"
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
