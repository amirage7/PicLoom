$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$frontendRoot = Join-Path $repoRoot 'frontend'
$desktopRoot = Join-Path $repoRoot 'desktop'
$backendBuild = Join-Path $PSScriptRoot 'build-backend.ps1'
$backendSmoke = Join-Path $PSScriptRoot 'test-backend-exe.ps1'

& npm.cmd --prefix $frontendRoot run build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $backendBuild
if ($LASTEXITCODE -ne 0) { throw 'Backend packaging failed.' }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $backendSmoke
if ($LASTEXITCODE -ne 0) { throw 'Backend executable smoke test failed.' }


& npm.cmd --prefix $desktopRoot run package
if ($LASTEXITCODE -ne 0) { throw 'Electron packaging failed.' }

$installer = Get-ChildItem -LiteralPath (Join-Path $desktopRoot 'release') -Filter '*.exe' |
  Where-Object { $_.Name -ne 'AI Image Canvas.exe' } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $installer) {
  throw 'NSIS installer was not created in desktop\release.'
}

Write-Host "Desktop installer: $($installer.FullName)"
