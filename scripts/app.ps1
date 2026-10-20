param([Parameter(Mandatory = $true)][ValidateSet('start', 'stop')][string]$Action, [switch]$OpenBrowser)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$runtime = Join-Path $root '.runtime'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$statePath = Join-Path $runtime 'process.json'
$lock = $null
$timer = [Diagnostics.Stopwatch]::StartNew()
Write-Host "Checking project $Action state..."
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
    Write-Host 'Checking Node.js, dependencies and port...'
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
    # Reuse built assets; include deleted/renamed files in the freshness check.
    $serverBuild = Join-Path $root 'dist\server.js'
    $pageBuild = Join-Path $root 'dist\index.html'
    $buildState = Join-Path $runtime 'build-inputs.txt'
    $inputs = @(Get-Item -LiteralPath 'server.ts', 'index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts')
    $inputs += @(Get-ChildItem -LiteralPath (Join-Path $root 'src'), (Join-Path $root 'server') -Recurse -File)
    # shortcut: metadata detects normal edits; use content hashes if source replacement preserves timestamps and sizes.
    $fingerprint = ($inputs | Sort-Object FullName | ForEach-Object { '{0}|{1}|{2}' -f $_.FullName, $_.Length, $_.LastWriteTimeUtc.Ticks }) -join "`n"
    $needsBuild = !(Test-Path -LiteralPath $serverBuild) -or !(Test-Path -LiteralPath $pageBuild) -or !(Test-Path -LiteralPath (Join-Path $root 'dist\assets'))
    if (!$needsBuild) {
        $needsBuild = !(Test-Path -LiteralPath $buildState) -or (Get-Content -LiteralPath $buildState -Raw) -cne $fingerprint
    }
    if ($needsBuild) {
        Write-Host 'Building updated frontend and backend (first start after code changes)...'
        $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
        & $npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Build failed. Fix the reported error before starting.' }
        if (!(Test-Path -LiteralPath $serverBuild) -or !(Test-Path -LiteralPath $pageBuild)) { throw 'Build did not produce the expected server and frontend.' }
        Set-Content -LiteralPath $buildState -Value $fingerprint -NoNewline
    } else { Write-Host 'Using the current built frontend and backend.' }
    # Keep a stable parent process for precise start/stop ownership.
    Write-Host 'Starting local server...'
    $previousMode = $env:NODE_ENV
    try {
        $env:NODE_ENV = 'production'
        $child = Start-Process -FilePath $node -ArgumentList @(('"' + $serverBuild + '"')) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime 'stdout.log') -RedirectStandardError (Join-Path $runtime 'stderr.log') -PassThru
    } finally { $env:NODE_ENV = $previousMode }
    $url = "http://127.0.0.1:$appPort"
    @{ id = $child.Id; started = $child.StartTime.ToUniversalTime().Ticks.ToString(); url = $url } | ConvertTo-Json | Set-Content -LiteralPath $statePath
    $ready = $false
    $nextProgress = $timer.Elapsed.TotalSeconds + 3
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
        if ($timer.Elapsed.TotalSeconds -ge $nextProgress) {
            Write-Host ("Waiting for the local server... {0:N0}s elapsed. Logs: .runtime\stderr.log" -f $timer.Elapsed.TotalSeconds)
            $nextProgress = $timer.Elapsed.TotalSeconds + 3
        }
        Start-Sleep -Milliseconds 500
    }
    if (!$ready) { throw 'Startup timed out. The process is still managed; inspect .runtime logs or use stop.bat.' }
    Write-Host ("Server ready in {0:N1}s. Open http://127.0.0.1:{1}" -f $timer.Elapsed.TotalSeconds, $appPort)
    Write-Host 'Qwen loads on the first extraction; opening the app does not wait for model loading.'
    Write-Host 'Browser login: .runtime\login.txt (or configured APP_USERNAME / APP_PASSWORD).'
    Write-Host 'Startup output: .runtime\stdout.log; errors: .runtime\stderr.log. Use stop.bat to stop.'
    if ($OpenBrowser) { Start-Process -FilePath $url }
} catch {
    Write-Host ('Error: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($lock) { $lock.Dispose() }
}
