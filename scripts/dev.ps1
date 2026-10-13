$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$packageManager = Get-Command pnpm -ErrorAction SilentlyContinue
if ($packageManager) {
    & $packageManager.Source dev
    exit $LASTEXITCODE
}
$runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node'
$nodeExecutable = Join-Path $runtimeRoot 'bin\node.exe'
$packageEntry = Join-Path $runtimeRoot 'node_modules\pnpm\bin\pnpm.cjs'
if (!(Test-Path $nodeExecutable) -or !(Test-Path $packageEntry)) {
    throw 'Install Node.js 22.12+ and pnpm, then run pnpm install and pnpm dev.'
}
$env:PATH = (Split-Path $nodeExecutable -Parent) + ';' + $env:PATH
& $nodeExecutable $packageEntry dev
exit $LASTEXITCODE
