param([Parameter(Mandatory = $true)][ValidateSet('start', 'stop')][string]$Action)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$runtime = Join-Path $root '.runtime'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$statePath = Join-Path $runtime 'process.json'
$lock = $null
try {
    # Serialize double-clicks so only one managed server can be started.
    $lock = [IO.File]::Open((Join-Path $runtime 'lifecycle.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    $managed = $null
    if (Test-Path -LiteralPath $statePath) {
        $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        $candidate = Get-Process -Id $state.id -ErrorAction SilentlyContinue
        if ($candidate -and $candidate.StartTime.ToUniversalTime().Ticks.ToString() -eq $state.started) {
            $managed = $candidate
        } else {
            Remove-Item -LiteralPath $statePath
        }
    }
    if ($Action -eq 'stop') {
        if ($managed) {
            # Kill only the recorded process tree, never every Node process or a port owner.
            & taskkill.exe /PID $managed.Id /T /F | Out-Null
            if ($LASTEXITCODE -ne 0) { throw 'Could not stop the managed process.' }
            Remove-Item -LiteralPath $statePath
            Write-Host 'Stopped. In-memory documents and settings have been cleared.'
        } else { Write-Host 'No managed server is running.' }
        exit 0
    }
    if ($managed) { Write-Host 'This project is already running. Use stop.bat before restarting.'; exit 0 }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $cli = Join-Path $root 'node_modules\tsx\dist\cli.mjs'
    if (!(Test-Path -LiteralPath $cli)) { throw 'Dependencies missing. Run npm ci in the project folder first.' }
    if (!(Test-Path -LiteralPath (Join-Path $root '.env'))) {
        Copy-Item -LiteralPath (Join-Path $root '.env.example') -Destination (Join-Path $root '.env')
    }
    # A stable tsx process avoids watch-mode restarts silently clearing the memory repository.
    $child = Start-Process -FilePath $node -ArgumentList @(('"' + $cli + '"'), ('"' + (Join-Path $root 'server.ts') + '"')) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime 'stdout.log') -RedirectStandardError (Join-Path $runtime 'stderr.log') -PassThru
    @{ id = $child.Id; started = $child.StartTime.ToUniversalTime().Ticks.ToString() } | ConvertTo-Json | Set-Content -LiteralPath $statePath
    Start-Sleep -Seconds 3
    $child.Refresh()
    if ($child.HasExited) {
        Remove-Item -LiteralPath $statePath
        throw 'Server exited during startup. See .runtime\stderr.log and .runtime\stdout.log.'
    }
    Write-Host 'Server process started. Open http://localhost:3000 (or PORT from .env).'
    Write-Host 'Startup output: .runtime\stdout.log; errors: .runtime\stderr.log. Use stop.bat to stop.'
} catch {
    Write-Host ('Error: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($lock) { $lock.Dispose() }
}
