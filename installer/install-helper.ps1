#Requires -Version 5.1
<#
    Laeuft waehrend der Inno-Setup-Installation (als Admin, silent).
    - Node.js installieren (optional)
    - npm install fuer Root + Server
    - start.bat erstellen
    - Firewall-Regeln anlegen
    - npm-Log-Dateien aufraeumen
#>

param(
    [Parameter(Mandatory)][string]$InstallDir,
    [string]$InstallNode = "0"
)

$ErrorActionPreference = "Continue"
$logFile = Join-Path $InstallDir "install-log.txt"

function Log {
    param($msg)
    $line = "$([datetime]::Now.ToString('HH:mm:ss'))  $msg"
    $line | Out-File $logFile -Append -Encoding UTF8
}

Log "===== install-helper.ps1 gestartet ====="
Log "InstallDir  : $InstallDir"
Log "InstallNode : $InstallNode"

# ---- 1. Node.js installieren ------------------------------------------------
if ($InstallNode -eq "1") {
    Log "Node.js LTS wird via winget installiert..."
    try {
        $p = Start-Process "winget" `
            -ArgumentList "install","--id","OpenJS.NodeJS.LTS","--silent",
                          "--accept-package-agreements","--accept-source-agreements" `
            -Wait -PassThru -WindowStyle Hidden
        Log "winget ExitCode: $($p.ExitCode)"
    } catch {
        Log "winget-Fehler: $_"
    }
    # Kurz warten bis PATH-Update durch den Installer propagiert ist
    Start-Sleep -Seconds 3
}

# ---- 2. Node.js finden ------------------------------------------------------
function Get-NodeDir {
    # PATH zuerst refreshen
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("PATH","User")

    $fromPath = Get-Command node -ErrorAction SilentlyContinue
    if ($fromPath) { return Split-Path $fromPath.Source }

    foreach ($p in @(
        "$env:ProgramFiles\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
    )) {
        if (Test-Path $p) { return Split-Path $p }
    }
    return $null
}

$nodeDir = Get-NodeDir
if (-not $nodeDir) {
    Log "FEHLER: Node.js nicht gefunden. Installation wird beendet."
    exit 1
}
Log "Node.js: $nodeDir"

$npmCmd = Join-Path $nodeDir "npm.cmd"
if (-not (Test-Path $npmCmd)) { $npmCmd = Join-Path $nodeDir "npm" }
Log "npm    : $npmCmd"

# ---- 3. npm install (Root) --------------------------------------------------
Log "npm install (Root)..."
$logRoot = Join-Path $InstallDir "npm-install-root.log"
$p = Start-Process $npmCmd `
    -ArgumentList "install","--prefer-offline" `
    -WorkingDirectory $InstallDir `
    -Wait -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $logRoot `
    -RedirectStandardError  ($logRoot -replace '\.log$','-err.log')
Log "npm install (Root) ExitCode: $($p.ExitCode)"

# ---- 4. npm install (Server) ------------------------------------------------
$serverDir = Join-Path $InstallDir "server"
Log "npm install (Server)..."
$logSrv = Join-Path $InstallDir "npm-install-server.log"
$p = Start-Process $npmCmd `
    -ArgumentList "install","--prefer-offline" `
    -WorkingDirectory $serverDir `
    -Wait -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $logSrv `
    -RedirectStandardError  ($logSrv -replace '\.log$','-err.log')
Log "npm install (Server) ExitCode: $($p.ExitCode)"

# ---- 5. start.bat erstellen -------------------------------------------------
Log "Erstelle start.bat..."
$batLines = @(
    '@echo off',
    'chcp 65001 > nul',
    'title Multi-Drone Control System',
    '',
    "set `"PATH=$nodeDir;%PATH%`"",
    'set "APPDIR=%~dp0"',
    '',
    'echo.',
    'echo  =====================================================',
    'echo    Multi-Drone Control System',
    'echo  =====================================================',
    'echo.',
    '',
    'echo  [1/2] Bridge-Server starten  (WebSocket :3001)...',
    'start "Bridge-Server :3001" cmd /k "cd /d "%APPDIR%server" && node serial-bridge.js"',
    'timeout /t 2 /nobreak > nul',
    '',
    'echo  [2/2] React-App starten  (:3000)...',
    'start "React-App :3000" cmd /k "cd /d "%APPDIR%" && npm start"',
    'timeout /t 2 /nobreak > nul',
    '',
    'echo.',
    'echo  System gestartet!',
    'echo    Bridge-Server : http://localhost:3001',
    'echo    Web-App       : http://localhost:3000',
    'echo.',
    'pause'
)
$batLines | Set-Content (Join-Path $InstallDir "start.bat") -Encoding ASCII
Log "start.bat erstellt"

# ---- 6. Firewall-Regeln -----------------------------------------------------
Log "Firewall-Regeln..."
foreach ($cfg in @(
    @{ Name = "MultiDroneControl React (TCP 3000)";  Port = 3000 },
    @{ Name = "MultiDroneControl Bridge (TCP 3001)"; Port = 3001 }
)) {
    if (-not (Get-NetFirewallRule -DisplayName $cfg.Name -ErrorAction SilentlyContinue)) {
        try {
            New-NetFirewallRule -DisplayName $cfg.Name -Direction Inbound `
                -Protocol TCP -LocalPort $cfg.Port -Action Allow | Out-Null
            Log "Firewall-Regel erstellt: $($cfg.Name)"
        } catch {
            Log "Firewall-Regel Fehler: $_"
        }
    } else {
        Log "Firewall-Regel bereits vorhanden: $($cfg.Name)"
    }
}

Log "===== install-helper.ps1 abgeschlossen ====="
exit 0
