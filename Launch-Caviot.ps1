param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$studioDirectory = $PSScriptRoot
$studioRoot = [IO.Path]::GetFullPath((Join-Path $studioDirectory 'dist'))

function Get-StudioHealth([int]$Port) {
    try { return Invoke-RestMethod -Uri "http://127.0.0.1:$Port/__caviot_health" -TimeoutSec 1 } catch { return $null }
}
function Open-Studio([int]$Port) {
    $studioUrl = "http://127.0.0.1:$Port/"
    if (!$NoBrowser) { Start-Process $studioUrl }
    Write-Output $studioUrl
}

try {
    if (!(Test-Path -LiteralPath (Join-Path $studioRoot 'index.html'))) { throw 'Extract the complete Caviot Studio ZIP before starting it.' }
    # Reuse this copy's server; never open an unrelated app on the same port.
    $activePorts = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -ge 4173 -and $_.LocalPort -le 4183 } | Select-Object -ExpandProperty LocalPort -Unique)
    foreach ($studioPort in $activePorts) {
        $health = Get-StudioHealth $studioPort
        if ($health.app -eq 'caviot-studio' -and $health.root -eq $studioRoot) {
            Open-Studio $studioPort
            exit 0
        }
    }
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $nodePath = if ($nodeCommand) { $nodeCommand.Source } else { $null }
    if (!$nodePath) {
        $candidates = @(
            "$env:ProgramFiles\nodejs\node.exe",
            "$env:SystemDrive\nvm4w\nodejs\node.exe",
            "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
        )
        if ($env:NVM_SYMLINK) { $candidates += Join-Path $env:NVM_SYMLINK 'node.exe' }
        $nodePath = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    }
    if (!$nodePath) { throw 'Node.js could not be found. Install Node.js, then double-click Caviot Studio again.' }
    $logDirectory = Join-Path $studioDirectory '.launcher'
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    foreach ($studioPort in 4173..4183) {
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $studioPort)
        try { $listener.Start() } catch { continue } finally { $listener.Stop() }
        $serverScript = Join-Path $studioDirectory 'serve.mjs'
        $serverProcess = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $serverScript + '"'), "$studioPort") -WorkingDirectory $studioDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory "server-$studioPort.log") -RedirectStandardError (Join-Path $logDirectory "server-$studioPort-error.log")
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            $health = Get-StudioHealth $studioPort
            if ($health.app -eq 'caviot-studio' -and $health.root -eq $studioRoot) {
                Open-Studio $studioPort
                exit 0
            }
            if ($serverProcess.HasExited) { break }
            Start-Sleep -Milliseconds 150
        }
        if (!$serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id }
    }
    throw "Caviot Studio could not start. See the logs in $logDirectory."
} catch {
    if (!$NoBrowser) {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Caviot Studio could not start') | Out-Null
    }
    Write-Error $_.Exception.Message
    exit 1
}
