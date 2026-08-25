$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $repoRoot 'backend'
$python = Join-Path $backendRoot '.venv\Scripts\python.exe'
$requirements = Join-Path $backendRoot 'requirements-build.txt'
$spec = Join-Path $backendRoot 'ai_image_canvas_backend.spec'
$distPath = Join-Path $backendRoot 'dist'
$workPath = Join-Path $backendRoot 'build\pyinstaller'
$artifact = Join-Path $distPath 'ai-image-canvas-backend.exe'

if (-not (Test-Path -LiteralPath $python)) {
  throw 'Backend virtual environment is missing. Create backend\.venv and install requirements first.'
}

& $python -m pip install -r $requirements
if ($LASTEXITCODE -ne 0) { throw 'Failed to install backend build dependencies.' }

Push-Location $backendRoot
try {
  & $python -m PyInstaller --noconfirm --clean --distpath $distPath --workpath $workPath $spec
  if ($LASTEXITCODE -ne 0) { throw 'PyInstaller failed.' }
} finally {
  Pop-Location
}

if (-not (Test-Path -LiteralPath $artifact)) {
  throw "Backend artifact was not created: $artifact"
}

Write-Host "Backend executable: $artifact"
