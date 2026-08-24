$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$frontendRoot = Join-Path $projectRoot 'frontend'
$backendRoot = Join-Path $projectRoot 'backend'
$pythonPath = Join-Path $backendRoot '.venv\Scripts\python.exe'

if (-not (Test-Path (Join-Path $frontendRoot 'node_modules'))) {
    throw 'Frontend dependencies are missing. Run npm install in frontend.'
}

if (-not (Test-Path $pythonPath)) {
    throw 'Backend virtual environment is missing. Create backend/.venv and install requirements.'
}

$backend = Start-Process -FilePath $pythonPath -WorkingDirectory $backendRoot -ArgumentList @(
    '-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000'
) -PassThru -WindowStyle Hidden

$frontend = Start-Process -FilePath 'npm.cmd' -WorkingDirectory $frontendRoot -ArgumentList @(
    'run', 'dev', '--', '--host', '127.0.0.1', '--port', '3000'
) -PassThru -WindowStyle Hidden

Write-Host 'AI Image Canvas is starting at http://127.0.0.1:3000'
Write-Host 'Press Ctrl+C to stop both services.'

try {
    Wait-Process -Id $backend.Id, $frontend.Id
}
finally {
    foreach ($process in @($backend, $frontend)) {
        if (-not $process.HasExited) {
            Stop-Process -Id $process.Id
        }
    }
}
