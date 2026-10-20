$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $root '.runtime\process.json'
if (Test-Path -LiteralPath $statePath) { throw 'Stop the managed app before running lifecycle tests.' }
$oldPort = $env:PORT
$oldMode = $env:NODE_ENV
$oldData = $env:DATA_PATH
$oldUser = $env:APP_USERNAME
$oldPassword = $env:APP_PASSWORD
$env:PORT = '3301'
$env:NODE_ENV = 'development'
$env:DATA_PATH = Join-Path $root ('.runtime\lifecycle-' + [guid]::NewGuid().ToString() + '.sqlite')
$env:APP_USERNAME = 'synthetic-lifecycle'
$env:APP_PASSWORD = 'synthetic-lifecycle-password'
$headers = @{ Authorization = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($env:APP_USERNAME + ':' + $env:APP_PASSWORD)) }
$probe = Join-Path $root ('src\lifecycle-probe-' + [guid]::NewGuid().ToString() + '.txt')
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
    $html = (Invoke-WebRequest http://127.0.0.1:3301/ -Headers $headers -UseBasicParsing).Content
    if ($html -match '@vite/client' -or $html -notmatch '/assets/index-[\w-]+\.js') { throw 'Launcher did not force built production assets.' }
    $builtAt = (Get-Item -LiteralPath (Join-Path $root 'dist\server.js')).LastWriteTimeUtc
    if ($openedUrls.Count -ne 1 -or $openedUrls[0] -ne 'http://127.0.0.1:3301') { throw 'Startup did not open the configured app URL.' }
    $env:PORT = '3302'
    Invoke-App start
    if ((Get-Content -LiteralPath $statePath -Raw) -ne $before) { throw 'Duplicate start changed the managed process.' }
    if ($openedUrls.Count -ne 2 -or $openedUrls[1] -ne 'http://127.0.0.1:3301') { throw 'Duplicate start did not reopen the running app URL.' }
    Invoke-App stop
    if (Test-Path -LiteralPath $statePath) { throw 'Stop did not clear state.' }
    $env:PORT = '3301'
    Invoke-App start
    if ((Get-Item -LiteralPath (Join-Path $root 'dist\server.js')).LastWriteTimeUtc -ne $builtAt) { throw 'Unchanged source unexpectedly rebuilt.' }
    Invoke-App stop
    Set-Content -LiteralPath $probe -Value 'Synthetic source freshness probe'
    Invoke-App start
    if ((Get-Item -LiteralPath (Join-Path $root 'dist\server.js')).LastWriteTimeUtc -le $builtAt) { throw 'Changed source did not rebuild.' }
    Invoke-App stop
    Remove-Item -LiteralPath $probe
    Invoke-App start
    $buildState = Get-Content -LiteralPath (Join-Path $root '.runtime\build-inputs.txt') -Raw
    if ($buildState.Contains($probe)) { throw 'Deleted source did not invalidate the build.' }
    Invoke-App stop
    Invoke-App stop
    Write-Host 'PASS: production assets, cached build, added/deleted source rebuild, health, browser URL, duplicate start/reopen, stop, repeated stop, stale PID protection.'
} finally {
    if (Test-Path -LiteralPath $statePath) { Invoke-App stop }
    if (Test-Path -LiteralPath $probe) { Remove-Item -LiteralPath $probe }
    $env:PORT = $oldPort
    $env:NODE_ENV = $oldMode
    $env:DATA_PATH = $oldData
    $env:APP_USERNAME = $oldUser
    $env:APP_PASSWORD = $oldPassword
}
