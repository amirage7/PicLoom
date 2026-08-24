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

$backendJob = Start-Job -Name 'ai-image-canvas-backend' -ArgumentList $pythonPath, $backendRoot -ScriptBlock {
    param($pythonExecutable, $workingDirectory)
    Set-Location -LiteralPath $workingDirectory
    & $pythonExecutable -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
}

$frontendJob = Start-Job -Name 'ai-image-canvas-frontend' -ArgumentList $frontendRoot -ScriptBlock {
    param($workingDirectory)
    Set-Location -LiteralPath $workingDirectory
    & npm.cmd run dev -- --host 127.0.0.1 --port 3000
}

$jobs = @($backendJob, $frontendJob)

Write-Host 'AI Image Canvas is starting at http://127.0.0.1:3000'
Write-Host 'Press Ctrl+C to stop both services.'

try {
    while (($jobs | Where-Object State -EQ 'Running').Count -eq $jobs.Count) {
        Wait-Job -Job $jobs -Any -Timeout 1 | Out-Null
    }

    $stoppedJobs = $jobs | Where-Object State -NE 'Running'
    if ($stoppedJobs) {
        foreach ($job in $stoppedJobs) {
            Receive-Job -Job $job | Write-Host
        }
        throw 'A development service stopped unexpectedly.'
    }
}
finally {
    foreach ($job in $jobs) {
        if ($job.State -eq 'Running') {
            Stop-Job -Job $job
        }
    }
    Remove-Job -Job $jobs -Force -ErrorAction SilentlyContinue
}
