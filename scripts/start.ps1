param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) { python -m venv .venv; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
& '.venv\Scripts\python.exe' -m pip install -r requirements.txt
if ($LASTEXITCODE) { exit $LASTEXITCODE }
npm ci --no-fund --no-audit
if ($LASTEXITCODE) { exit $LASTEXITCODE }
npm run build
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Write-Host "WindDesk is starting at http://localhost:$Port"
& '.venv\Scripts\python.exe' -m uvicorn backend.app:app --host 127.0.0.1 --port $Port
