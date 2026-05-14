# Multi-Drone Control — CLAUDE.md

> ✅ **Desktop-Migration abgeschlossen** (2026-05-14). Siehe `MIGRATION_PLAN.md`.
> Installer: `dist-electron\Multi-Drone Control-Setup-2.0.0.exe` (100 MB NSIS).
> Public API von `src/utils/droneConnection.js` stabil — automatisches Electron/Web-Detect.

## Projektübersicht

Drohnenschwarm-Steuerungssystem für bis zu 4 ESP32-Drohnen via LoRa (868 MHz).

**Stack (Desktop-Modus, Ziel):**
- Electron + React 18 + TailwindCSS → eine .exe, kein Bridge-Server nötig
- `electron/main.js` + `electron/serial-manager.js` → USB-Serial direkt im Main-Process
- `electron/preload.js` → exposes `window.electronAPI` für IPC
- ESP32-Firmware `AccessPoint_ESP32.ino` → LoRa-Gateway (SX1262, 868 MHz, SF7, BW125)
- KiCad PCB `Schem/ESP Drone/v1/` → Drohnen-Hardware (ESP32-S3, BMP280, GPS u-blox M10)

**Stack (Web-Modus, Legacy/Fallback):**
- React (Browser) ↔ `server/serial-bridge.js` (WS :3001) ↔ ESP32
- `droneConnection.js` erkennt automatisch ob Electron oder Browser

## System starten

**Desktop (Ziel-Modus, nach Migration):**
```powershell
npm run electron:dev     # React Dev + Electron Window mit Hot-Reload
npm run electron:build   # Production-Build → dist-electron/*.exe
```

**Web (Legacy):**
```powershell
# Terminal 1 – Bridge-Server
Set-Location server; npm start        # WebSocket+REST auf :3001

# Terminal 2 – React Dev
npm start                             # React auf :3000
```

## Architektur & Kommunikation

**Desktop (Electron):**
```
Drohne 1-4
  └── LoRa SX1262 (868 MHz, SF7, BW125, CR4/5, sync 0xAB)
        └── ESP32 AccessPoint (USB-Serial 115200 baud, JSON+\n)
              └── electron/serial-manager.js  (Main Process)
                    └── IPC (window.electronAPI)
                          └── React Renderer
```

**Web (Legacy):**
```
ESP32 AccessPoint
  └── server/serial-bridge.js  (WebSocket :3001 + REST /api/ports)
        └── React App  (:3000)
```

**JSON-Protokoll (ESP32 ↔ Serial-Manager / Bridge):**
- Commands an Drohnen: `{"cmd":"send","to":<id>,"seq":<n>,"payload":{...}}`
- Broadcast: `{"cmd":"broadcast","seq":<n>,"payload":{...}}`
- Telemetrie: `{"type":"telemetry","id":<id>,"agl":...,"rssi":...}`
- ACK: `{"type":"ack","id":<id>,"seq":<n>}`
- TDMA-Slots: Drohne N sendet in Slot `(N-1) × 50 ms`

**IPC-Kanäle (Desktop, Renderer ↔ Main):**
- `ports:list`, `ports:connect`, `ports:disconnect`, `bridge:status`
- `drone:send`, `drone:broadcast`, `drone:discover`, `drone:list`, `drone:funke`, `drone:timesync`
- Events (Main → Renderer): `event:ap_connected`, `event:telemetry`, `event:lora_rx`, `event:lora_terminal_rx`, `event:drone_list`, `event:preflight`, `event:error` etc.

## Wichtige Dateien

| Datei | Zweck |
|---|---|
| `src/components/MultiDroneControl.jsx` | Haupt-Komponente, State-Management |
| `src/components/ThreeScene.jsx` | Three.js 3D-Visualisierung |
| `src/components/DronePanel.jsx` | Pro-Drohne Telemetrie-Anzeige |
| `src/components/KeyframeEditor.jsx` | Mission-Waypoint-Editor |
| `src/components/MissionExport.jsx` | JSON-Export für SD-Karte |
| `src/components/BlackboxViewer.jsx` | Flugdaten-CSV-Analyse (SVG-Charts) |
| `src/components/LoraTerminal.jsx` | Raw LoRa-Monitor |
| `src/components/FunkeControl.jsx` | Jumper T2 Pro Transmitter UI |
| `src/utils/droneConnection.js` | Connection-Client, auto-detect Electron/Web, Public API stabil |
| `src/utils/interpolation.js` | Waypoint-Interpolation (RGB, Position) |
| `src/i18n/index.js` | DE/EN i18n via React Context |
| `src/constants/defaults.js` | Default-Werte |
| `electron/main.js` | Electron Main Process, IPC-Handler, BrowserWindow |
| `electron/preload.js` | Context Bridge → `window.electronAPI` |
| `electron/serial-manager.js` | Serial-Logik (EventEmitter), Port-Registry, ESP32-AutoDetect |
| `server/serial-bridge.js` | WS+REST Bridge (Legacy für Web-Modus) |
| `server/udp-bridge.js` | UDP-Alternative (Legacy) |
| `MIGRATION_PLAN.md` | Migration-Plan + Continuity-Doku |

## Mission-Format (Waypoints)

```json
{
  "id": 1,
  "waypoints": [
    {
      "x": 0, "y": 0, "z": 1.5,
      "speed": 1.0, "wait": 0,
      "r": 255, "g": 0, "b": 0,
      "fn": 0, "fp": 0
    }
  ]
}
```

- `fn`: LED-Funktion — `0` solid, `1` pulse (Periode in `fp` ms), `2` strobe (Intervall in `fp` ms)
- Kein `yaw`/`pitch`/`roll` — Lage kommt ausschließlich vom Positionsregler
- Änderungen am Format müssen synchron in Firmware + Web-App erfolgen

## i18n-Konventionen

```jsx
import { useLanguage } from '../i18n';

function MyComponent() {
  const { t } = useLanguage();
  return <button>{t('arm')}</button>;
}
```

Neue Texte immer in `src/i18n/index.js` unter `de` UND `en` hinzufügen.

## Hardware-Details

- **Drohnen-IDs**: 1–4
- **LoRa-Adressierung**: `"to": 0` = Broadcast, `"to": N` = Drohne N
- **Barometer**: BMP280 auf I²C-Bus 0 (IO05 SDA, IO06 SCL), AGL = `baro_alt - baro_home_alt`
- **GPS**: u-blox M10 auf UART + I²C (IO01/IO02), min. 6 Satelliten für Mission-Start
- **Pre-flight Checks**: NO_MISSION, BARO_FAIL, NO_GPS_FIX, LOW_SATS, NO_HOME
- **Blackbox**: `/bb_<id>.csv` auf SD-Karte, ~25 Hz, Ring-Buffer 400 Einträge

## Ports & Proxy

- React Dev: `http://localhost:3000`
- Bridge-Server (nur Web-Modus): `http://localhost:3001` (WebSocket + REST)
- Desktop-Modus: keine Ports, alles via IPC
- `package.json` → `"proxy": "http://localhost:3002"` ← veraltet, echte WS-URL ist `:3001` (hardcoded in `droneConnection.js`)

## Coding-Konventionen

- Komponenten: `.jsx` in `src/components/`
- Utilities: `.js` in `src/utils/`
- State-Management: React Hooks (kein Redux)
- Styling: TailwindCSS-Klassen, kein separates CSS (außer `index.css`)
- Keine Kommentare außer bei nicht-offensichtlichem Verhalten
- i18n für alle User-sichtbaren Strings
