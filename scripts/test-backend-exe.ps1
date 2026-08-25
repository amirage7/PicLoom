param([int]$Port = 18081)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$executable = Join-Path $repoRoot 'backend\dist\ai-image-canvas-backend.exe'
if (-not (Test-Path -LiteralPath $executable)) {
  throw "Backend executable is missing: $executable"
}

$port = $Port
$activePorts = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port
if ($activePorts -contains $port) {
  throw "Backend smoke port is already in use: $port"
}

$smokeRoot = Join-Path ([IO.Path]::GetTempPath()) ("ai-image-canvas-smoke-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $smokeRoot | Out-Null
$previousDataDir = $env:AI_IMAGE_CANVAS_DATA_DIR
$env:AI_IMAGE_CANVAS_DATA_DIR = $smokeRoot

try {
  $backendWorkingDirectory = Split-Path -Parent $executable
  Push-Location $backendWorkingDirectory
  try {
    & $executable --port $port
  } finally {
    Pop-Location
  }
  $deadline = [DateTime]::UtcNow.AddSeconds(60)
  $health = $null
  while ([DateTime]::UtcNow -lt $deadline) {
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 1
      break
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  if (-not $health -or $health.status -ne 'ok') {
    throw 'Backend executable did not become healthy.'
  }

  $projects = @(Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/projects" -TimeoutSec 5)
  if ($projects.Count -lt 1) {
    throw 'Backend executable returned no projects.'
  }
  if (-not (Test-Path -LiteralPath (Join-Path $smokeRoot 'database.sqlite'))) {
    throw 'Backend executable did not create its SQLite database in the requested data directory.'
  }

  Write-Host "Backend smoke test passed on 127.0.0.1:$port with $($projects.Count) projects."
} finally {
  $smokeProcesses = Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -eq $executable -and $_.CommandLine -match "--port\s+$port(?:\s|$)"
  }
  foreach ($smokeProcess in $smokeProcesses) {
    Stop-Process -Id $smokeProcess.ProcessId -ErrorAction SilentlyContinue
  }
  if ($null -eq $previousDataDir) {
    Remove-Item Env:AI_IMAGE_CANVAS_DATA_DIR -ErrorAction SilentlyContinue
  } else {
    $env:AI_IMAGE_CANVAS_DATA_DIR = $previousDataDir
  }
  $resolvedSmokeRoot = [IO.Path]::GetFullPath($smokeRoot)
  $resolvedTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if ($resolvedSmokeRoot.StartsWith($resolvedTempRoot, [StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $resolvedSmokeRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
