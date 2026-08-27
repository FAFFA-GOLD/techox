# TECHOox local launcher (dev)
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
  Write-Host "  TECHOox launcher"
  Write-Host "  Folder: $PWD"
  Write-Host "========================================"
  Write-Host ""

  $nodeDir = "C:\Program Files\nodejs"
  if (Test-Path "$nodeDir\npm.cmd") {
    $env:Path = "$nodeDir;$env:Path"
  }

  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: npm not found. https://nodejs.org/"
    Pause-End
    exit 1
  }

  if (-not (Test-Path ".env.local")) {
    Write-Host "ERROR: .env.local missing."
    Pause-End
    exit 1
  }

  if (-not (Test-Path "node_modules")) {
    Write-Host "npm install ..."
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed ($LASTEXITCODE)" }
  }

  $already = $false
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2 | Out-Null
    $already = $true
  } catch { $already = $false }

  if ($already) {
    Write-Host "Already running. Opening browser."
    Start-Process $url
    Pause-End
    exit 0
  }

  Write-Host "Starting. Keep this window open. Stop with Ctrl+C."
  Start-Job -ScriptBlock {
    param($u)
    Start-Sleep -Seconds 6
    Start-Process $u
  } -ArgumentList $url | Out-Null

  & npm.cmd run dev
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
