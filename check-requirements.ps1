# Check this machine has what the demo needs, and change nothing.
#
#   .\check-requirements.ps1
#
# Exit 0 = ready to run .\start.ps1
# Exit 1 = something required is missing; each line says what to install.
#
# Safe to run anywhere, any number of times: it only reads.

$missing = @()
$warn    = @()

function Report([string]$label, [bool]$ok, [string]$detail, [string]$fix, [bool]$required = $true) {
  # A missing tool has no version string, and a blank column reads as though
  # the check itself failed to run.
  if (-not $detail -or -not $detail.Trim()) { $detail = 'not found' }
  if ($ok) {
    Write-Host ("  [ok]      {0,-22} {1}" -f $label, $detail) -ForegroundColor Green
  } elseif ($required) {
    Write-Host ("  [MISSING] {0,-22} {1}" -f $label, $detail) -ForegroundColor Red
    Write-Host ("            -> {0}" -f $fix) -ForegroundColor Yellow
    $script:missing += $label
  } else {
    Write-Host ("  [warn]    {0,-22} {1}" -f $label, $detail) -ForegroundColor Yellow
    Write-Host ("            -> {0}" -f $fix) -ForegroundColor Yellow
    $script:warn += $label
  }
}

# A command's first line of version output, or $null when it is not installed.
#
# The executable is invoked DIRECTLY, not through `cmd.exe /c "$exe $args"`:
# building a command string there re-parses it, so `git --version` lost its
# argument and printed usage, and `npx --version` returned cmd's own banner.
#
# $ErrorActionPreference is lowered for the call because in PowerShell 5.1 a
# native command writing to stderr raises an ErrorRecord that would otherwise
# abort this script - and several of these tools print version text to stderr.
function Version([string]$exe, [string]$flag = '--version') {
  $cmd = Get-Command $exe -ErrorAction SilentlyContinue
  if (-not $cmd) { return $null }
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & $exe $flag 2>&1 | Out-String
    $line = ($out -split "`r?`n" | Where-Object { $_.Trim() -and $_ -notmatch '^\s*$' } | Select-Object -First 1)
    if ($line) { return $line.Trim() }
    return 'installed'
  } catch {
    return 'installed'
  } finally {
    $ErrorActionPreference = $prev
  }
}

Write-Host "`nClearFunds - checking this machine`n" -ForegroundColor Cyan

# --- Required ----------------------------------------------------------------

# Git. Needed to clone, and to check out the demo branch.
$git = Version 'git'
Report 'Git' ($null -ne $git) $git 'https://git-scm.com/download/win'

# Node, for npx and the frontend. The Supabase CLI is run through npx, so no
# separate CLI install is needed.
#
# The version is PARSED, not just presence-checked: Vite 7 and the toolchain
# need Node 20 or newer, and an older Node fails later with an error that does
# not name the version as the cause.
$node = Version 'node'
$nodeOk = $false
if ($node) {
  $m = [regex]::Match($node, 'v(\d+)\.')
  if ($m.Success -and [int]$m.Groups[1].Value -ge 20) { $nodeOk = $true }
}
$nodeDetail = if ($node) { "$node (need v20+)" } else { 'not found' }
Report 'Node.js 20+' $nodeOk $nodeDetail 'https://nodejs.org - the LTS installer'

# npx ships with Node, but check it resolves: a partial install breaks here.
$npx = Version 'npx'
Report 'npx' ($null -ne $npx) $npx 'Comes with Node.js - reinstall Node'

# Deno runs the seed script. Without it start.ps1 SKIPS the seed and the app
# loads empty while every step still reports green, which is the worst case.
$deno = Version 'deno'
Report 'Deno' ($null -ne $deno) $deno 'winget install DenoLand.Deno'

# psql: start.ps1 counts existing rows with it to decide whether to seed.
$psql = Version 'psql'
Report 'psql' ($null -ne $psql) $psql 'Install PostgreSQL client tools, or add its bin to PATH'

# Docker: the binary AND a responding daemon are different failures, so they
# are two separate lines.
$docker = Version 'docker'
Report 'Docker' ($null -ne $docker) $docker 'https://www.docker.com/products/docker-desktop'

if ($docker) {
  docker ps *> $null
  $daemonUp = ($LASTEXITCODE -eq 0)
  # Not required: start.ps1 starts Docker Desktop itself and waits for it.
  Report 'Docker daemon' $daemonUp `
    $(if ($daemonUp) { 'responding' } else { 'installed but not running' }) `
    'start.ps1 will start Docker Desktop and wait - or start it yourself first' $false
}

# --- Informational -----------------------------------------------------------

Write-Host ""

# Disk: the Supabase containers and images are the bulk of it.
try {
  $drive = (Get-Item -Path $PSScriptRoot).PSDrive.Name
  $free  = [math]::Round((Get-PSDrive $drive).Free / 1GB, 1)
  Report "Free disk on ${drive}:" ($free -ge 8) "$free GB" `
    'The Supabase images need roughly 5-8 GB; free some space' ($false)
} catch { }

# Which revision this is, because the demo needs a branch that is not yet on
# main. Reported, never changed.
try {
  Push-Location $PSScriptRoot
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $branch = (& git rev-parse --abbrev-ref HEAD 2>&1 | Out-String).Trim()
  $ErrorActionPreference = $prevEap
  Pop-Location
  if ($branch -and $branch -notmatch 'fatal|not a git') {
    $hasYear = Select-String -Path "$PSScriptRoot\backend\scripts\seed.ts" `
      -Pattern '2024-25' -SimpleMatch -Quiet -ErrorAction SilentlyContinue
    if ($hasYear) {
      Write-Host ("  [ok]      {0,-22} {1}" -f 'Checkout', "$branch - seeds a year the auditor can close") -ForegroundColor Green
    } else {
      Write-Host ("  [warn]    {0,-22} {1}" -f 'Checkout', "$branch - has NO closeable year") -ForegroundColor Yellow
      Write-Host "            -> the auditor sign-off cannot be demoed from this revision." -ForegroundColor Yellow
      Write-Host "            -> see demo.md; switch BEFORE the first start.ps1 run." -ForegroundColor Yellow
    }
  }
} catch { }

# --- Verdict -----------------------------------------------------------------

Write-Host ""
if ($missing.Count -gt 0) {
  Write-Host ("Not ready: {0} missing - {1}" -f $missing.Count, ($missing -join ', ')) -ForegroundColor Red
  Write-Host "Install the items marked above, then run this again.`n"
  exit 1
}

if ($warn.Count -gt 0) {
  Write-Host ("Ready, with {0} warning(s): {1}" -f $warn.Count, ($warn -join ', ')) -ForegroundColor Yellow
} else {
  Write-Host "Ready." -ForegroundColor Green
}
Write-Host "Next:  .\start.ps1`n" -ForegroundColor Cyan
exit 0
