; Multi-Drone Control -- Inno Setup Script
; Bauen: powershell -File installer\build-installer.ps1
;        oder direkt: iscc.exe installer\setup.iss

#define AppName      "Multi-Drone Control"
#define AppVersion   "2.0"
#define AppPublisher "Ninico1000"

; ---- [Setup] -----------------------------------------------------------------
[Setup]
AppId={{A3F2C1B8-9D4E-4F7A-B6C2-1E5D8F3A9C7B}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} v{#AppVersion}
AppPublisher={#AppPublisher}
AppCopyright=Copyright (C) 2026 {#AppPublisher}

DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
AllowNoIcons=yes

OutputDir=..\dist
OutputBaseFilename=MultiDroneControl-Setup-v{#AppVersion}

Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern

; Admin-Rechte erforderlich (Firewall, Program Files)
PrivilegesRequired=admin

; 64-Bit Installation
ArchitecturesInstallIn64BitMode=x64compatible

; Uninstaller
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\start.bat

; ---- [Languages] ------------------------------------------------------------
[Languages]
Name: german;  MessagesFile: "compiler:Languages\German.isl"
Name: english; MessagesFile: "compiler:Default.isl"

; ---- [Tasks] ----------------------------------------------------------------
[Tasks]
Name: desktopicon; Description: "Desktop-Verknuepfung erstellen"; GroupDescription: "Zusaetzliche Optionen:"; Flags: unchecked

; ---- [Files] ----------------------------------------------------------------
[Files]
; React-App Quellcode
Source: "..\src\*";    DestDir: "{app}\src";    Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs

; Konfiguration
Source: "..\package.json";       DestDir: "{app}"; Flags: ignoreversion
Source: "..\package-lock.json";  DestDir: "{app}"; Flags: ignoreversion
Source: "..\postcss.config.js";  DestDir: "{app}"; Flags: ignoreversion
Source: "..\tailwind.config.js"; DestDir: "{app}"; Flags: ignoreversion

; Bridge-Server
Source: "..\server\serial-bridge.js";  DestDir: "{app}\server"; Flags: ignoreversion
Source: "..\server\udp-bridge.js";     DestDir: "{app}\server"; Flags: ignoreversion
Source: "..\server\package.json";      DestDir: "{app}\server"; Flags: ignoreversion
Source: "..\server\package-lock.json"; DestDir: "{app}\server"; Flags: ignoreversion

; ESP32 Firmware (Referenz)
Source: "..\AccessPoint_ESP32.ino"; DestDir: "{app}"; Flags: ignoreversion

; Installations-Hilfsskript (wird nach Abschluss geloescht)
Source: "install-helper.ps1"; DestDir: "{app}"; Flags: ignoreversion deleteafterinstall

; ---- [Icons] ----------------------------------------------------------------
[Icons]
; Start-Menue
Name: "{group}\{#AppName} starten";               Filename: "{app}\start.bat"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"

; Desktop (optional)
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\start.bat"; WorkingDir: "{app}"; Tasks: desktopicon

; ---- [Run] ------------------------------------------------------------------
[Run]
; Schritt 1: Node.js LTS installieren (nur wenn nicht vorhanden)
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements"""; StatusMsg: "Node.js LTS wird installiert..."; Check: NeedsNodeJS; Flags: runhidden waituntilterminated

; Schritt 2: npm-Abhaengigkeiten + start.bat + Firewall via install-helper.ps1
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\install-helper.ps1"" -InstallDir ""{app}"" -InstallNode {code:GetInstallNodeFlag}"; StatusMsg: "npm-Abhaengigkeiten werden installiert (kann einige Minuten dauern)..."; Flags: runhidden waituntilterminated

; Optional: App nach Installation direkt oeffnen
Filename: "{app}\start.bat"; Description: "{#AppName} jetzt starten"; Flags: nowait postinstall skipifsilent shellexec

; ---- [UninstallRun] ---------------------------------------------------------
[UninstallRun]
; Firewall-Regeln beim Deinstallieren entfernen
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""Remove-NetFirewallRule -DisplayName 'MultiDroneControl*' -ErrorAction SilentlyContinue"""; RunOnceId: "RemoveFirewall"; Flags: runhidden waituntilterminated

; ---- [Code] -----------------------------------------------------------------
[Code]

// Prueft ob Node.js installiert ist
function NeedsNodeJS(): Boolean;
var
  NodePath: String;
begin
  // Standard-Installationspfade pruefen
  if FileExists(ExpandConstant('{commonpf64}\nodejs\node.exe')) then begin Result := False; Exit; end;
  if FileExists(ExpandConstant('{commonpf}\nodejs\node.exe'))   then begin Result := False; Exit; end;
  if FileExists(ExpandConstant('{localappdata}\Programs\nodejs\node.exe')) then begin Result := False; Exit; end;

  // Registry pruefen (64-Bit)
  if RegQueryStringValue(HKLM64, 'SOFTWARE\Node.js', 'InstallPath', NodePath) then
    if FileExists(NodePath + '\node.exe') then begin Result := False; Exit; end;

  // Registry pruefen (32-Bit)
  if RegQueryStringValue(HKLM, 'SOFTWARE\Node.js', 'InstallPath', NodePath) then
    if FileExists(NodePath + '\node.exe') then begin Result := False; Exit; end;

  Result := True;
end;

// Gibt "1" wenn Node.js benoetigt wird, sonst "0" -- wird in [Run] als {code:GetInstallNodeFlag} aufgerufen
function GetInstallNodeFlag(Dummy: String): String;
begin
  if NeedsNodeJS() then Result := '1' else Result := '0';
end;

// Willkommensseite: zeige Hinweis wenn Node.js fehlt
procedure InitializeWizard();
begin
  if NeedsNodeJS() then
    MsgBox(
      'Node.js wurde nicht gefunden und wird automatisch installiert.' + #13#10 +
      'Dazu wird eine Internetverbindung benoetigt.' + #13#10#13#10 +
      'Die Installation kann einige Minuten dauern.',
      mbInformation, MB_OK);
end;
