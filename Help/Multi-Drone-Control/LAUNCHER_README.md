# System Launcher - AoA Locator Integration

## Übersicht

Der System Launcher ist ein integriertes Tool zum Starten und Verwalten aller Programme des AoA Locator Systems direkt aus der React-Anwendung.

## Features

- ✅ **GUI Prozess-Management** - Starten/Stoppen aller Programme
- ✅ **Anchor Monitoring** - Separate Monitore pro Anker
- ✅ **Real-time Status** - Live-Status aller laufenden Programme
- ✅ **Auto-Start** - Konfigurierbare Auto-Start-Programme
- ✅ **Output Viewing** - Anzeige der Programmausgaben
- ✅ **Config Integration** - Automatisches Laden der Anchor-Konfiguration

## Architektur

```
┌─────────────────────────────────────────┐
│  React Frontend (Port 3000)             │
│  ┌────────────────────────────────────┐ │
│  │  SystemLauncher.jsx               │ │
│  │  - GUI für Prozess-Management     │ │
│  │  - Status-Anzeige                 │ │
│  │  - Program Cards                  │ │
│  └────────────────────────────────────┘ │
└───────────────┬─────────────────────────┘
                │ HTTP/REST
                ↓
┌─────────────────────────────────────────┐
│  Express API Server (Port 3002)         │
│  ┌────────────────────────────────────┐ │
│  │  launcher-api.js                  │ │
│  │  - REST Endpoints                 │ │
│  │  - Config Management              │ │
│  └────────────────────────────────────┘ │
│  ┌────────────────────────────────────┐ │
│  │  process-manager.js               │ │
│  │  - Prozess-Spawning               │ │
│  │  - Status-Tracking                │ │
│  │  - Output-Capturing               │ │
│  └────────────────────────────────────┘ │
└───────────────┬─────────────────────────┘
                │ Child Processes
                ↓
┌─────────────────────────────────────────┐
│  External Programs                      │
│  ├─ Calibration Tool (Python/Tkinter)  │
│  ├─ IQ Sample Reader (Python)          │
│  ├─ Anchor Monitors (Python)           │
│  └─ System Monitor (Python)            │
└─────────────────────────────────────────┘
```

## Installation

### 1. Backend Dependencies installieren

```bash
cd server
npm install express cors concurrently
```

### 2. Frontend ist bereits vorbereitet

Die SystemLauncher-Komponente ist in `src/components/SystemLauncher.jsx` vorhanden.

### 3. Python-Programme vorbereiten

Alle Python-Programme müssen installiert sein:

```bash
# Kalibrierungs-Tool
cd ../aoa_locator/calibration_tool
python3 -m venv venv
venv/bin/pip install -r requirements.txt

# IQ Sample Reader ist bereits vorhanden
cd ../examples
# Keine zusätzlichen Dependencies nötig (außer denen aus ../calibration_tool)
```

## Verwendung

### Server starten

**Option 1: Alle Services gleichzeitig**
```bash
cd server
npm run start:all
```

Startet:
- Serial Bridge (Port 8080)
- Launcher API (Port 3002)

**Option 2: Nur Launcher API**
```bash
cd server
npm run start:launcher
```

**Option 3: Manuell**
```bash
cd server
node launcher-api.js
```

### React App starten

```bash
npm start
```

Die App läuft auf http://localhost:3000

### SystemLauncher öffnen

1. **Via Button**: Klicke auf "System Launcher" in der Toolbar
2. **Via Keyboard**: Drücke `Ctrl+L` oder `Cmd+L`

## Verfügbare Programme

### 1. Calibration Tool

- **Beschreibung**: GUI-Tool für Anker-Kalibrierung
- **Type**: GUI (detached process)
- **Pfad**: `aoa_locator/calibration_tool/run_calibration_tool.sh`
- **Auto-Start**: Nein

### 2. IQ Sample Reader

- **Beschreibung**: Liest IQ-Samples von Ankern
- **Type**: Terminal (mit Output)
- **Pfad**: `aoa_locator/examples/read_iq_samples.py`
- **Args**: Serial Port (z.B. `/dev/ttyACM0`)
- **Auto-Start**: Nein

### 3. Anchor Monitors

- **Beschreibung**: Separate Monitore pro Anker
- **Type**: Terminal (mit Output)
- **Auto-generiert**: Aus `config.json`
- **Args**: Serial Port des jeweiligen Ankers

### 4. System Monitor

- **Beschreibung**: Überwacht Gesamt-System-Gesundheit
- **Type**: Background
- **Auto-Start**: Ja (optional)

## API Endpoints

### GET /api/launcher/status

Status aller Programme abrufen.

**Response:**
```json
{
  "programs": {
    "calibration_tool": {
      "pid": 12345,
      "status": "running",
      "startTime": 1234567890,
      "uptime": 5000,
      "name": "Calibration Tool",
      "type": "gui"
    }
  },
  "activePrograms": 1,
  "uptime": 60000,
  "timestamp": 1234567890
}
```

### POST /api/launcher/start

Programm starten.

**Request:**
```json
{
  "programId": "calibration_tool"
}
```

**Response:**
```json
{
  "programId": "calibration_tool",
  "pid": 12345,
  "status": "running"
}
```

### POST /api/launcher/stop

Programm stoppen.

**Request:**
```json
{
  "programId": "calibration_tool"
}
```

**Response:**
```json
{
  "programId": "calibration_tool",
  "status": "stopped"
}
```

### GET /api/launcher/config

Aktuelle Konfiguration laden.

**Response:**
```json
{
  "version": "1.0",
  "anchors": [
    {
      "anchor_id": "1",
      "serial_port": "/dev/ttyACM0",
      "position": [0, 0, 2]
    }
  ]
}
```

### GET /api/launcher/output/:programId

Programmausgabe abrufen.

**Query Parameters:**
- `lines` (optional): Anzahl der Zeilen (default: 50)

**Response:**
```json
{
  "programId": "iq_sample_reader",
  "output": [
    {
      "type": "stdout",
      "data": "Packet received...",
      "timestamp": 1234567890
    }
  ]
}
```

### POST /api/launcher/reload-config

Konfiguration neu laden.

### POST /api/launcher/stop-all

Alle Programme stoppen.

## Konfiguration

### Config-Datei

Der Launcher lädt automatisch `aoa_locator/calibration_tool/config.json`.

Beispiel:
```json
{
  "version": "1.0",
  "anchors": [
    {
      "anchor_id": "1",
      "serial_port": "/dev/ttyACM0",
      "position": [0.0, 0.0, 2.0]
    },
    {
      "anchor_id": "2",
      "serial_port": "/dev/ttyACM1",
      "position": [4.0, 0.0, 2.0]
    }
  ]
}
```

### Program Definitions

Programme werden in `server/process-manager.js` definiert:

```javascript
programDefinitions: {
  calibration_tool: {
    name: 'Calibration Tool',
    command: 'bash',
    args: ['path/to/run_calibration_tool.sh'],
    cwd: 'working/directory',
    type: 'gui',  // gui, terminal, background
    restartOnExit: false
  }
}
```

## Entwicklung

### Neues Programm hinzufügen

1. **Backend**: Definition in `process-manager.js` hinzufügen
```javascript
new_program: {
  name: 'New Program',
  command: 'python3',
  args: ['script.py'],
  cwd: '/path',
  type: 'terminal',
  restartOnExit: false
}
```

2. **Frontend**: Zu `programs` State in `SystemLauncher.jsx` hinzufügen
```javascript
{
  id: 'new_program',
  name: 'New Program',
  description: 'Description',
  icon: Terminal,
  path: 'path/to/script.py',
  type: 'terminal',
  status: 'stopped',
  autoStart: false
}
```

### Debugging

**Backend Logs:**
```bash
cd server
node launcher-api.js
# Logs zeigen Prozess-Start/Stop und Fehler
```

**Frontend Console:**
Öffne Browser DevTools → Console für API-Calls und Fehler

**Programm Output:**
- Im Launcher UI: Klicke auf Programm-Karte für Details
- Via API: `GET /api/launcher/output/:programId`

## Troubleshooting

### Problem: Programme starten nicht

**Lösung:**
1. Prüfe Pfade in `process-manager.js`
2. Prüfe ob Scripts ausführbar sind: `chmod +x script.sh`
3. Prüfe Python-Environment: Virtual Environment aktiviert?
4. Logs ansehen: Launcher API Terminal

### Problem: "Command not found"

**Lösung:**
- Absolute Pfade verwenden statt relative
- Script-Pfade in `process-manager.js` korrigieren
- PATH-Variable prüfen

### Problem: GUI-Programme blockieren

**Lösung:**
- Type muss auf `'gui'` gesetzt sein
- `detached: true` und `stdio: 'ignore'` für GUI-Programme

### Problem: Permissions Error (Linux)

**Lösung:**
```bash
# Serial Port Berechtigung
sudo chmod 666 /dev/ttyACM0

# Oder User zu dialout-Gruppe hinzufügen
sudo usermod -a -G dialout $USER
# Danach neu anmelden
```

### Problem: Port 3002 bereits in Verwendung

**Lösung:**
```bash
# Prozess finden und beenden
lsof -i :3002
kill <PID>

# Oder anderen Port verwenden
LAUNCHER_PORT=3003 node launcher-api.js
```

## Sicherheit

### Wichtig!

- Der Launcher kann **beliebige Programme** starten
- **Nur in vertrauenswürdigen Netzwerken** verwenden
- Für Production: Authentifizierung hinzufügen
- CORS ist aktuell offen - für Production einschränken

### Production-Ready machen

1. **Authentifizierung hinzufügen:**
```javascript
const auth = require('basic-auth');

app.use((req, res, next) => {
  const credentials = auth(req);
  if (!credentials || credentials.name !== 'user' || credentials.pass !== 'password') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

2. **CORS einschränken:**
```javascript
app.use(cors({
  origin: 'https://yourdomain.com'
}));
```

3. **HTTPS verwenden**

## Best Practices

1. **Config-Datei immer aktuell halten**
2. **Programme nach Verwendung stoppen** (spart Ressourcen)
3. **Logs regelmäßig prüfen**
4. **Auto-Start nur für kritische Services**
5. **Backups der Konfiguration erstellen**

## Integration mit Multi-Drone System

Der Launcher ist nahtlos in das Multi-Drone Control System integriert:

1. **Anchor Setup**: Verwende Calibration Tool für Anker-Konfiguration
2. **Monitoring**: IQ Sample Reader zeigt Live-Daten
3. **Positioning**: Daten fließen in AoA-Berechnungen
4. **Mission Planning**: Koordinaten aus Calibration Tool nutzen

## Weitere Ressourcen

- [SystemLauncher Integration Guide](src/components/SystemLauncher.integration.md)
- [Calibration Tool README](aoa_locator/calibration_tool/README.md)
- [Process Manager Source](server/process-manager.js)
- [Launcher API Source](server/launcher-api.js)

## Support

Bei Problemen:
1. Logs prüfen (Backend + Frontend)
2. Config-Datei validieren
3. Berechtigungen prüfen (Serial Ports)
4. Dependencies installiert?

## Lizenz

Teil des Multi-Drone Control Systems.
