$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $root '.runtime\process.json'
if (Test-Path -LiteralPath $statePath) { throw 'Stop the managed app before running lifecycle tests.' }
$oldPort = $env:PORT
$oldMode = $env:NODE_ENV
$env:PORT = '3301'
$env:NODE_ENV = 'development'
$openedUrls = New-Object 'System.Collections.Generic.List[string]'
function Start-Process {
    param($FilePath, $ArgumentList, $WorkingDirectory, $WindowStyle, $RedirectStandardOutput, $RedirectStandardError, [switch]$PassThru)
    if ($FilePath -like 'http://*') {
        $openedUrls.Add($FilePath)
    } else {
        Microsoft.PowerShell.Management\Start-Process @PSBoundParameters
    }
}
function Invoke-App([string]$action) {
    & (Join-Path $PSScriptRoot 'app.ps1') $action -OpenBrowser
    if ($LASTEXITCODE -ne 0) { throw "Lifecycle action failed: $action" }
}
try {
    Invoke-App stop
    # A stale identity must not stop an unrelated process, even if its PID is reused.
    New-Item -ItemType Directory -Force (Split-Path -Parent $statePath) | Out-Null
    @{ id = $PID; started = '0' } | ConvertTo-Json | Set-Content -LiteralPath $statePath
    Invoke-App stop
    if (Test-Path -LiteralPath $statePath) { throw 'Stale state was not cleared.' }
    Invoke-App start
    $before = Get-Content -LiteralPath $statePath -Raw
    $health = Invoke-RestMethod http://127.0.0.1:3301/api/health
    if ($health.status -ne 'ok') { throw 'Health check failed.' }
    if ($openedUrls.Count -ne 1 -or $openedUrls[0] -ne 'http://127.0.0.1:3301') { throw 'Startup did not open the configured app URL.' }
    $env:PORT = '3302'
    Invoke-App start
    if ((Get-Content -LiteralPath $statePath -Raw) -ne $before) { throw 'Duplicate start changed the managed process.' }
    if ($openedUrls.Count -ne 2 -or $openedUrls[1] -ne 'http://127.0.0.1:3301') { throw 'Duplicate start did not reopen the running app URL.' }
    Invoke-App stop
    if (Test-Path -LiteralPath $statePath) { throw 'Stop did not clear state.' }
    Invoke-App stop
    Write-Host 'PASS: start, health, browser URL, duplicate start/reopen, stop, repeated stop, stale PID protection.'
} finally {
    if (Test-Path -LiteralPath $statePath) { Invoke-App stop }
    $env:PORT = $oldPort
    $env:NODE_ENV = $oldMode
}
