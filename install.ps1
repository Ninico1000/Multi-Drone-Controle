#Requires -Version 5.1
<#
.SYNOPSIS
    Multi-Drone Control -- Vollstaendiges Installations-Skript
.DESCRIPTION
    Installiert Node.js LTS (falls nicht vorhanden), npm-Abhaengigkeiten
    fuer React-App und Bridge-Server, Windows-Firewall-Regeln, erstellt
    start.bat und eine Desktop-Verknuepfung.
    Wird automatisch mit Admin-Rechten neu gestartet falls noetig.
.EXAMPLE
    Rechtsklick -> "Mit PowerShell ausfuehren"
    oder: powershell -ExecutionPolicy Bypass -File install.ps1
#>

# --- Admin-Rechte sicherstellen ----------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Fehlende Admin-Rechte -- starte neu als Administrator..." -ForegroundColor Yellow
    $relaunchArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    Start-Process powershell -Verb RunAs -ArgumentList $relaunchArgs
    exit
}

Set-StrictMode -Off
$ErrorActionPreference = "Stop"
$ProjectDir = $PSScriptRoot

# --- Hilfsfunktionen ---------------------------------------------------------
function Write-Header {
    param($text)
    Write-Host ""
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "  $('-' * $text.Length)" -ForegroundColor DarkCyan
}

function Write-Ok   { param($msg) Write-Host "  [OK]     $msg" -ForegroundColor Green }
function Write-Info { param($msg) Write-Host "  [...]    $msg" -ForegroundColor Gray }

function Write-Fail {
    param($msg)
    Write-Host ""
    Write-Host "  [FEHLER] $msg" -ForegroundColor Red
    Write-Host ""
    Read-Host "  Enter druecken zum Beenden"
    exit 1
}

function Refresh-Path {
    $machinePath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    $userPath    = [System.Environment]::GetEnvironmentVariable("PATH", "User")
    $env:PATH = "$machinePath;$userPath"
}

function Find-NodeExe {
    $fromPath = Get-Command node -ErrorAction SilentlyContinue
    $candidates = @(
        $(if ($fromPath) { $fromPath.Source } else { $null }),
        "$env:ProgramFiles\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
    ) | Where-Object { $_ -and (Test-Path $_) }
    return $candidates | Select-Object -First 1
}

# --- Banner ------------------------------------------------------------------
Clear-Host
Write-Host ""
Write-Host "  =====================================================" -ForegroundColor Blue
Write-Host "     Multi-Drone Control -- Installations-Skript"       -ForegroundColor Blue
Write-Host "  =====================================================" -ForegroundColor Blue
Write-Host "  Verzeichnis: $ProjectDir" -ForegroundColor DarkGray
Write-Host ""

# --- Schritt 1: Node.js ------------------------------------------------------
Write-Header "Schritt 1/5 -- Node.js"

Refresh-Path
$nodeExe = Find-NodeExe

if ($nodeExe) {
    $nodeVer = & $nodeExe --version
    Write-Ok "Node.js gefunden ($nodeVer) -- $nodeExe"
} else {
    Write-Info "Node.js nicht gefunden -- installiere LTS via winget..."
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        Write-Fail "winget nicht gefunden. Bitte Node.js manuell installieren: https://nodejs.org"
    }
    winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { Write-Fail "winget-Installation fehlgeschlagen (Exit $LASTEXITCODE)." }

    Refresh-Path
    $nodeExe = Find-NodeExe
    if (-not $nodeExe) { Write-Fail "Node.js nach Installation nicht gefunden. Bitte neu starten und erneut ausfuehren." }

    $nodeVer = & $nodeExe --version
    Write-Ok "Node.js installiert: $nodeVer"
}

# npm-Pfad ableiten
$nodeDir = Split-Path $nodeExe
$npmCmd  = Join-Path $nodeDir "npm.cmd"
if (-not (Test-Path $npmCmd)) { $npmCmd = Join-Path $nodeDir "npm" }
if (-not (Test-Path $npmCmd)) { Write-Fail "npm nicht gefunden neben $nodeExe" }

$npmVer = & $npmCmd --version
Write-Ok "npm v$npmVer"

# --- Schritt 2: React-Abhaengigkeiten ----------------------------------------
Write-Header "Schritt 2/5 -- React-App-Abhaengigkeiten (root)"

Push-Location $ProjectDir
Write-Info "npm install (kann einige Minuten dauern)..."
& $npmCmd install 2>&1 | ForEach-Object {
    if ($_ -match "^(added|warn|error|npm ERR)") { Write-Host "     $_" -ForegroundColor DarkGray }
}
$npmExit = $LASTEXITCODE
Pop-Location
if ($npmExit -ne 0) { Write-Fail "npm install im Root fehlgeschlagen (Exit $npmExit)." }
Write-Ok "React-Abhaengigkeiten installiert"

# --- Schritt 3: Server-Abhaengigkeiten ---------------------------------------
Write-Header "Schritt 3/5 -- Bridge-Server-Abhaengigkeiten (server/)"

$serverDir = Join-Path $ProjectDir "server"
if (-not (Test-Path $serverDir)) { Write-Fail "server/ Verzeichnis nicht gefunden." }

Push-Location $serverDir
Write-Info "npm install..."
& $npmCmd install 2>&1 | ForEach-Object {
    if ($_ -match "^(added|warn|error|npm ERR)") { Write-Host "     $_" -ForegroundColor DarkGray }
}
$npmExit = $LASTEXITCODE
Pop-Location
if ($npmExit -ne 0) { Write-Fail "npm install in server/ fehlgeschlagen (Exit $npmExit)." }
Write-Ok "Bridge-Server-Abhaengigkeiten installiert"

# --- Schritt 4: Firewall-Regeln ----------------------------------------------
Write-Header "Schritt 4/5 -- Windows Firewall"

$firewallRules = @(
    @{ Name = "MultiDroneControl React (TCP 3000)";  Port = 3000; Desc = "React Dev-Server" },
    @{ Name = "MultiDroneControl Bridge (TCP 3001)"; Port = 3001; Desc = "WebSocket/REST Bridge" }
)
foreach ($rule in $firewallRules) {
    $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Ok "Bereits vorhanden: $($rule.Name)"
    } else {
        New-NetFirewallRule `
            -DisplayName $rule.Name `
            -Direction   Inbound `
            -Protocol    TCP `
            -LocalPort   $rule.Port `
            -Action      Allow `
            -Description $rule.Desc | Out-Null
        Write-Ok "Erstellt: $($rule.Name)"
    }
}

# --- Schritt 5: Start-Skript & Desktop-Verknuepfung -------------------------
Write-Header "Schritt 5/5 -- Start-Skript und Desktop-Verknuepfung"

# start.bat als Array bauen (vermeidet Here-String Encoding-Probleme)
$batLines = @(
    '@echo off',
    'chcp 65001 > nul',
    'title Multi-Drone Control System',
    '',
    'set "PROJ=%~dp0"',
    "set `"NODE_DIR=$nodeDir`"",
    '',
    'echo.',
    'echo  =====================================================',
    'echo    Multi-Drone Control System wird gestartet...',
    'echo  =====================================================',
    'echo.',
    '',
    'echo  [1/2] Bridge-Server starten (WebSocket :3001)...',
    "start `"Bridge-Server :3001`" cmd /k `"set PATH=$nodeDir;%PATH% && cd /d `"%PROJ%server`" && node serial-bridge.js`"",
    'timeout /t 2 /nobreak > nul',
    '',
    'echo  [2/2] React-App starten (:3000)...',
    "start `"React-App :3000`" cmd /k `"set PATH=$nodeDir;%PATH% && cd /d `"%PROJ%`" && npm start`"",
    'timeout /t 2 /nobreak > nul',
    '',
    'echo.',
    'echo  System gestartet!',
    'echo    Bridge-Server : http://localhost:3001',
    'echo    Web-App       : http://localhost:3000',
    'echo.',
    'pause'
)

$startBatPath = Join-Path $ProjectDir "start.bat"
$batLines | Set-Content $startBatPath -Encoding ASCII
Write-Ok "start.bat erstellt"

# Desktop-Verknuepfung
try {
    $desktopPath  = [Environment]::GetFolderPath("Desktop")
    $shortcutPath = Join-Path $desktopPath "Multi-Drone Control.lnk"
    $wsh      = New-Object -ComObject WScript.Shell
    $shortcut = $wsh.CreateShortcut($shortcutPath)
    $shortcut.TargetPath       = $startBatPath
    $shortcut.WorkingDirectory = $ProjectDir
    $shortcut.Description      = "Multi-Drone Control System starten"
    $shortcut.WindowStyle      = 1
    $shortcut.Save()
    Write-Ok "Desktop-Verknuepfung erstellt: Multi-Drone Control.lnk"
} catch {
    Write-Host "  [WARN] Desktop-Verknuepfung konnte nicht erstellt werden: $_" -ForegroundColor Yellow
}

# --- Fertig ------------------------------------------------------------------
Write-Host ""
Write-Host "  =====================================================" -ForegroundColor Green
Write-Host "     Installation abgeschlossen!" -ForegroundColor Green
Write-Host "  =====================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Starten mit:" -ForegroundColor White
Write-Host "    start.bat             -- beide Server starten" -ForegroundColor Gray
Write-Host "    Desktop-Verknuepfung  -- Multi-Drone Control.lnk" -ForegroundColor Gray
Write-Host ""
Write-Host "  Manuell (separate Terminals):" -ForegroundColor White
Write-Host "    cd server && node serial-bridge.js   # Bridge :3001" -ForegroundColor DarkGray
Write-Host "    npm start                             # React  :3000" -ForegroundColor DarkGray
Write-Host ""
Read-Host "  Enter druecken zum Beenden"
