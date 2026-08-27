# TECHOox local launcher (stable: build + start)
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

function Pause-End {
  Write-Host ""
  Read-Host "Enter key to close"
}

try {
  $port = 3000
  $url = "http://localhost:$port"

  Write-Host "========================================"
  Write-Host "  TECHOox stable launcher"
  Write-Host "  Folder: $PWD"
  Write-Host "========================================"
  Write-Host ""

  $nodeDir = "C:\Program Files\nodejs"
  if (Test-Path "$nodeDir\npm.cmd") {
    $env:Path = "$nodeDir;$env:Path"
  }

  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) {
    Write-Host "ERROR: npm not found. Install Node.js LTS from https://nodejs.org/"
    Pause-End
    exit 1
  }

  if (-not (Test-Path ".env.local")) {
    Write-Host "ERROR: .env.local missing. Copy .env.example and set Supabase keys."
    Pause-End
    exit 1
  }

  if (-not (Test-Path "node_modules")) {
    Write-Host "Step 1/3: npm install ..."
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed ($LASTEXITCODE)" }
  } else {
    Write-Host "Step 1/3: node_modules OK"
  }

  Write-Host ""
  Write-Host "Step 2/3: npm run build (may take a few minutes) ..."
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build failed ($LASTEXITCODE)" }

  Write-Host ""
  Write-Host "Step 3/3: checking $url ..."
  $already = $false
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2 | Out-Null
    $already = $true
  } catch {
    $already = $false
  }

  if ($already) {
    Write-Host ""
    Write-Host "NOTE: $url is already responding."
    Write-Host "Close the other TECHOox/node window first, then retry."
    Write-Host "Opening browser only."
    Start-Process $url
    Pause-End
    exit 0
  }

  Write-Host "Starting server. Keep this window open. Stop with Ctrl+C."
  Write-Host "Browser will open in a few seconds."
  Start-Job -ScriptBlock {
    param($u)
    Start-Sleep -Seconds 5
    Start-Process $u
  } -ArgumentList $url | Out-Null

  & npm.cmd start
  Write-Host ""
  Write-Host "Server stopped."
  Pause-End
}
catch {
  Write-Host ""
  $msg = $_.Exception.Message
  Write-Host "ERROR: $msg"
  Pause-End
  exit 1
}
