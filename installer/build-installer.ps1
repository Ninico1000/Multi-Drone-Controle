#Requires -Version 5.1
<#
.SYNOPSIS
    Baut den Multi-Drone Control Windows-Installer (setup.exe).
.DESCRIPTION
    Laedt Inno Setup bei Bedarf direkt nach %LOCALAPPDATA% herunter (kein Admin noetig),
    und kompiliert installer\setup.iss zu dist\MultiDroneControl-Setup-v2.0.exe.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File installer\build-installer.ps1
#>

$ErrorActionPreference = "Stop"
$ScriptDir   = $PSScriptRoot
$ProjectRoot = Split-Path $ScriptDir

# Lokales Inno-Setup-Verzeichnis (kein Admin noetig)
$InnoLocalDir  = "$env:LOCALAPPDATA\InnoSetup6"
$InnoLocalIscc = "$InnoLocalDir\iscc.exe"

Write-Host ""
Write-Host "  =====================================================" -ForegroundColor Blue
Write-Host "     Multi-Drone Control -- Installer bauen"            -ForegroundColor Blue
Write-Host "  =====================================================" -ForegroundColor Blue
Write-Host ""

# ---- Inno Setup finden (System-Installation + lokale Kopie) -----------------
function Find-IsccExe {
    # 1. Bekannte System-Installationspfade
    foreach ($p in @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\iscc.exe",
        "$env:ProgramFiles\Inno Setup 6\iscc.exe"
    )) { if (Test-Path $p) { return $p } }

    # 2. Registry (system-wide Install)
    foreach ($key in @(
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1',
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1'
    )) {
        $loc = (Get-ItemProperty $key -ErrorAction SilentlyContinue).InstallLocation
        if ($loc -and (Test-Path "$loc\iscc.exe")) { return "$loc\iscc.exe" }
    }

    # 3. Lokale Kopie (von diesem Skript heruntergeladen)
    if (Test-Path $InnoLocalIscc) { return $InnoLocalIscc }

    # 4. PATH
    $cmd = Get-Command iscc -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    return $null
}

# ---- Inno Setup herunterladen wenn noetig -----------------------------------
function Install-InnoSetupLocal {
    Write-Host "  [..] Inno Setup wird heruntergeladen..." -ForegroundColor Yellow

    # Aktuelle Version von der offiziellen Seite ermitteln
    $downloadUrl = "https://jrsoftware.org/download.php/is.exe"
    $installerPath = "$env:TEMP\innosetup-latest.exe"

    Write-Host "  [..] Download: $downloadUrl" -ForegroundColor Gray
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing
    } catch {
        Write-Host "  [ERR] Download fehlgeschlagen: $_" -ForegroundColor Red
        throw
    }

    Write-Host "  [..] Installiere nach $InnoLocalDir ..." -ForegroundColor Gray
    New-Item $InnoLocalDir -ItemType Directory -Force | Out-Null

    # /VERYSILENT /SUPPRESSMSGBOXES: kein Admin-Popup, kein UAC
    # /DIR=...: Installation in LOCALAPPDATA (kein Admin noetig)
    # /NOICONS: keine Start-Menue-Eintraege anlegen
    $p = Start-Process $installerPath `
        -ArgumentList "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NOICONS", "/NORESTART", "/DIR=`"$InnoLocalDir`"" `
        -Wait -PassThru
    Write-Host "  [..] Inno Setup Installer ExitCode: $($p.ExitCode)" -ForegroundColor Gray

    if (-not (Test-Path $InnoLocalIscc)) {
        throw "iscc.exe nicht gefunden nach lokaler Installation in $InnoLocalDir"
    }
    Write-Host "  [OK] Inno Setup lokal installiert: $InnoLocalIscc" -ForegroundColor Green
}

# ---- Haupt-Logik ------------------------------------------------------------
$iscc = Find-IsccExe

if (-not $iscc) {
    Install-InnoSetupLocal
    $iscc = Find-IsccExe
    if (-not $iscc) {
        Write-Error "iscc.exe nicht gefunden. Bitte Inno Setup manuell installieren: https://jrsoftware.org/isdl.php"
        exit 1
    }
}

Write-Host "  [OK] Inno Setup: $iscc" -ForegroundColor Green

# ---- dist/ sicherstellen ----------------------------------------------------
$distDir = Join-Path $ProjectRoot "dist"
New-Item $distDir -ItemType Directory -Force | Out-Null

# ---- Kompilieren ------------------------------------------------------------
$issFile = Join-Path $ScriptDir "setup.iss"
Write-Host "  [..] Kompiliere setup.iss ..." -ForegroundColor Cyan
Write-Host ""

& $iscc $issFile

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Error "Kompilierung fehlgeschlagen (iscc ExitCode $LASTEXITCODE)."
    exit 1
}

# ---- Ergebnis ---------------------------------------------------------------
$exe = Get-ChildItem $distDir -Filter "*.exe" -ErrorAction SilentlyContinue |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1

Write-Host ""
Write-Host "  =====================================================" -ForegroundColor Green
Write-Host "     Installer erfolgreich gebaut!" -ForegroundColor Green
Write-Host "  =====================================================" -ForegroundColor Green
Write-Host ""
if ($exe) {
    $sizeMB = [math]::Round($exe.Length / 1MB, 1)
    Write-Host "  Datei   : $($exe.FullName)" -ForegroundColor White
    Write-Host "  Groesse : $sizeMB MB" -ForegroundColor Gray
}
Write-Host ""
Write-Host "  -> EXE an Ziel-PC weitergeben und als Admin ausfuehren!" -ForegroundColor DarkGray
Write-Host ""
