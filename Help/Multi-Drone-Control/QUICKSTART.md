# Quick Start Guide - System Launcher

## Schnellstart in 3 Schritten

### 1. System starten

```bash
cd "/home/user/src/Scripts/Multi Drone Control"
./start-system.sh
```

Das Script:
- ✓ Prüft alle Dependencies
- ✓ Installiert fehlende Pakete
- ✓ Startet Launcher API (Port 3002)
- ✓ Startet Serial Bridge (Port 8080)
- ✓ Startet React App (Port 3000)
- ✓ Öffnet Browser automatisch

### 2. System Launcher öffnen

In der React-App:
1. Klicke auf **"System Launcher"** Button (oben rechts)
2. Oder drücke **`Ctrl+L`** / **`Cmd+L`**

### 3. Programme starten

Im System Launcher:
1. **Calibration Tool**: Konfiguriere Anker-Positionen
2. **IQ Sample Reader**: Zeige Live-Daten an
3. **Anchor Monitors**: Überwache einzelne Anker

## Verfügbare Programme

### Calibration Tool
**Was macht es?** GUI für Anker-Kalibrierung

**Wann nutzen?**
- Erste Installation
- Neue Anker hinzufügen
- Positionen ändern
- Kalibrierung durchführen

**Start:** Click "Start" im Launcher

---

### IQ Sample Reader
**Was macht es?** Zeigt IQ-Samples von Ankern

**Wann nutzen?**
- Daten-Monitoring
- System-Testing
- Debug

**Start:** Click "Start" im Launcher

---

### Anchor Monitors
**Was macht es?** Monitor pro Anker

**Wann nutzen?**
- Multi-Anker-Setup
- Gleichzeitiges Monitoring
- Troubleshooting

**Auto-generiert** aus `config.json`

---

## Typischer Workflow

### Erste Einrichtung

1. **Calibration Tool starten**
   ```
   System Launcher → Calibration Tool → Start
   ```

2. **Anker konfigurieren**
   - Anker hinzufügen (ID, Serial Port, Position)
   - Verbindung testen
   - Positionen validieren

3. **Referenz-Messungen**
   - 5-10 bekannte Positionen messen
   - Jeweils 10 Sekunden pro Position
   - Korrekturen berechnen

4. **Config speichern**
   - `File → Save Configuration`
   - Als `config.json` speichern

5. **Config neu laden**
   ```
   System Launcher → Refresh
   ```
   Jetzt werden Anchor Monitors angezeigt!

### Tägliche Verwendung

1. **System starten**
   ```bash
   ./start-system.sh
   ```

2. **Launcher öffnen**
   - Button oder `Ctrl+L`

3. **Monitoring starten**
   - IQ Sample Reader für Gesamt-Überblick
   - Oder einzelne Anchor Monitors

4. **Drohnen-Missions planen**
   - Im Haupt-Interface
   - Nutze kalibrierte Positionen

## Tastatur-Shortcuts

| Shortcut | Aktion |
|----------|--------|
| `Ctrl+L` / `Cmd+L` | System Launcher öffnen |
| `Esc` | Launcher schließen |

## Status-Anzeigen

### Program Status
- 🟢 **running** - Programm läuft
- 🔴 **stopped** - Programm gestoppt
- 🟡 **starting** - Programm startet
- 🔴 **error** - Fehler aufgetreten

### System Status
- 🟢 **Connected** - API erreichbar
- 🔴 **Disconnected** - API nicht erreichbar
- **X active** - Anzahl laufender Programme

## Troubleshooting

### "Failed to start program"

**Mögliche Ursachen:**
1. Pfad falsch → Prüfe `process-manager.js`
2. Keine Berechtigung → `chmod +x script.sh`
3. Dependencies fehlen → Installiere Pakete

**Lösung:**
```bash
# Logs ansehen
tail -f logs/launcher-api.log

# Berechtigungen prüfen
ls -l aoa_locator/calibration_tool/run_calibration_tool.sh

# Dependencies prüfen
cd aoa_locator/calibration_tool
venv/bin/pip list
```

---

### "Port already in use"

**Lösung:**
```bash
# Prozess finden
lsof -i :3002

# Beenden
kill <PID>

# Oder start-system.sh neu starten
```

---

### "No anchor monitors"

**Ursache:** Keine `config.json` gefunden

**Lösung:**
1. Calibration Tool starten
2. Anker hinzufügen
3. Config speichern
4. Launcher refreshen

---

### Serial Port Fehler

**Ursache:** Keine Berechtigung

**Lösung (Linux):**
```bash
# Einmalig
sudo chmod 666 /dev/ttyACM0

# Permanent
sudo usermod -a -G dialout $USER
# Danach neu anmelden
```

---

## Erweiterte Nutzung

### CLI-Steuerung

**Via curl:**

```bash
# Status abrufen
curl http://localhost:3002/api/launcher/status

# Programm starten
curl -X POST http://localhost:3002/api/launcher/start \
  -H "Content-Type: application/json" \
  -d '{"programId":"calibration_tool"}'

# Programm stoppen
curl -X POST http://localhost:3002/api/launcher/stop \
  -H "Content-Type: application/json" \
  -d '{"programId":"calibration_tool"}'

# Alle stoppen
curl -X POST http://localhost:3002/api/launcher/stop-all
```

### Programm-Output ansehen

```bash
# Via API
curl http://localhost:3002/api/launcher/output/iq_sample_reader?lines=100

# Via Logs
tail -f logs/launcher-api.log
```

### Nur Launcher API starten

```bash
cd server
npm run start:launcher
```

### Nur React App starten

```bash
npm start
```

## Datei-Übersicht

```
Multi Drone Control/
├── start-system.sh           # → Haupt-Startup-Script
├── LAUNCHER_README.md        # → Vollständige Dokumentation
├── QUICKSTART.md             # → Diese Datei
│
├── server/
│   ├── launcher-api.js       # → Express API Server
│   ├── process-manager.js    # → Prozess-Management
│   └── package.json          # → Dependencies
│
├── src/components/
│   ├── SystemLauncher.jsx    # → React Komponente
│   └── SystemLauncher.integration.md  # → Integrations-Guide
│
└── aoa_locator/
    └── calibration_tool/
        ├── calibration_tool.py
        ├── run_calibration_tool.sh
        └── config.json           # → System-Konfiguration
```

## Nächste Schritte

Nach dem Quick Start:

1. **Integration in App**
   - Siehe: `src/components/SystemLauncher.integration.md`
   - Button zu MultiDroneControl hinzufügen

2. **Kalibrierung durchführen**
   - Siehe: `aoa_locator/calibration_tool/README.md`
   - Vollständige Kalibrierungs-Anleitung

3. **System verstehen**
   - Siehe: `LAUNCHER_README.md`
   - Architektur und API-Dokumentation

## Hilfe

**Bei Problemen:**
1. ✓ Logs prüfen (`logs/` Verzeichnis)
2. ✓ Dependencies installiert? (`./start-system.sh` prüft das)
3. ✓ Ports frei? (3000, 3002, 8080)
4. ✓ Berechtigungen? (Serial Ports, Scripts)

**Dokumentation:**
- LAUNCHER_README.md - Vollständige Doku
- aoa_locator/calibration_tool/README.md - Kalibrierung
- SystemLauncher.integration.md - Integration

## Los geht's!

```bash
./start-system.sh
```

🚀 Viel Erfolg mit dem AoA Locator System!
