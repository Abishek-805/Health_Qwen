param([Parameter(Mandatory = $true)][ValidateSet('start', 'stop')][string]$Action, [switch]$OpenBrowser)
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
            Write-Host 'Stopped. Saved documents and settings remain in data\discharge.sqlite.'
        } else { Write-Host 'No managed server is running.' }
        exit 0
    }
    if ($managed) {
        Write-Host 'This project is already running. Use stop.bat before restarting.'
        if ($OpenBrowser -and $state.url) { Start-Process -FilePath $state.url }
        exit 0
    }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $cli = Join-Path $root 'node_modules\tsx\dist\cli.mjs'
    if (!(Test-Path -LiteralPath $cli)) { throw 'Dependencies missing. Run npm ci in the project folder first.' }
    if (!(Test-Path -LiteralPath (Join-Path $root '.env'))) {
        Copy-Item -LiteralPath (Join-Path $root '.env.example') -Destination (Join-Path $root '.env')
    }
    $appPort = & $node -e "require('dotenv').config({quiet:true});process.stdout.write(process.env.PORT||'3000');"
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the local port configuration.' }
    $portProbe = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, [int]$appPort)
    try { $portProbe.Start() } finally { $portProbe.Stop() }
    # Keep a stable parent process for precise start/stop ownership.
    $child = Start-Process -FilePath $node -ArgumentList @(('"' + $cli + '"'), ('"' + (Join-Path $root 'server.ts') + '"')) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime 'stdout.log') -RedirectStandardError (Join-Path $runtime 'stderr.log') -PassThru
    $url = "http://127.0.0.1:$appPort"
    @{ id = $child.Id; started = $child.StartTime.ToUniversalTime().Ticks.ToString(); url = $url } | ConvertTo-Json | Set-Content -LiteralPath $statePath
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        $child.Refresh()
        if ($child.HasExited) {
            Remove-Item -LiteralPath $statePath
            throw 'Server exited during startup. See .runtime\stderr.log and .runtime\stdout.log.'
        }
        try {
            $health = Invoke-RestMethod -Uri ("http://127.0.0.1:$appPort/api/health") -TimeoutSec 1
            if ($health.status -eq 'ok') { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    if (!$ready) { throw 'Startup timed out. The process is still managed; inspect .runtime logs or use stop.bat.' }
    Write-Host "Server ready. Open http://127.0.0.1:$appPort"
    Write-Host 'Browser login: .runtime\login.txt (or configured APP_USERNAME / APP_PASSWORD).'
    Write-Host 'Startup output: .runtime\stdout.log; errors: .runtime\stderr.log. Use stop.bat to stop.'
    if ($OpenBrowser) { Start-Process -FilePath $url }
} catch {
    Write-Host ('Error: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($lock) { $lock.Dispose() }
}
