# Changelog

## 2026-04-25 — Multi-Drone Control & ESP Drone v1

---

### Hardwareseitige Änderungen (KiCad)

- **BMP280 Barometer** zur Platine hinzugefügt — I²C Bus 0, geteilt mit MPU-6050 (IO05/IO06)
- **GPS I²C-Anschluss** ergänzt — IO01 (SDA) / IO02 (SCL) für u-blox M10 DDC-Interface
- GPS-Connector auf 6-poliges JST-EH erweitert (UART + I²C + Versorgung)
- Gerbers und BOM aktualisiert (PCBWay-Produktionsdaten)

---

### Firmware — `esp_drone_v1.ino`

#### Neue Hardware-Unterstützung
- **BMP280 Barometer** integriert (`Adafruit_BMP280`, I²C Bus 0)
  - Sampling: NORMAL, Pressure ×16, Filter ×16, Standby 1 ms
  - AGL-Berechnung: `baro_alt - baro_home_alt` (Nullpunkt wird beim Armen gesetzt)
- **GPS-I²C-Pins** definiert (IO01/IO02), GPS-Kommunikation bleibt auf UART

#### SD-Karte / Mission
- `mission.json` wird beim Boot vollständig in RAM geladen (`mission_buf[25600]`)
- `{"cmd":"reload"}` parst den RAM-Buffer neu — kein SD-Zugriff zur Laufzeit
- Neue Mission-JSON-Struktur: `yaw`, `pitch`, `roll` entfernt; `fn`/`fp` (LED-Farbfunktion) hinzugefügt

#### Flugsteuerung
- Höhenregler (RTH, Mission, Landing) verwendet ausschließlich Barometer-Höhe statt GPS-Höhe
- Neue **LED-Farbfunktionen**: `fn=0` Dauerlicht, `fn=1` Puls (Periode in `fp` ms), `fn=2` Strobe (Intervall in `fp` ms)
- `baro_home_alt` wird beim Armen und beim Mission-Start erfasst

#### Notaus-Modi
- `{"cmd":"land"}` → **Sanfte Landung (Mode 4)**: kontrollierter Abstieg 0,4 m/s, Disarm bei 15 cm AGL
- `{"cmd":"emergency"}` → **Harter Cutoff**: sofortiger Motorstopp ohne Abstieg

#### LoRa-Protokoll
- **Adressierung**: Befehle mit `"to": drone_id` (oder `0` = Broadcast) — Drohne ignoriert fremde Pakete
- **Sequenznummern**: `"seq"` in Befehlen, Drohne ACKt mit `{"type":"ack","id":N,"seq":S}`
- **TDMA-Telemetrie**: Jede Drohne sendet in eigenem Zeitfenster (`(id-1) × 50 ms`) → keine Kollisionen bei bis zu 4 Drohnen
- **RSSI** in Telemetrie-Paketen (`"rssi"` Feld)
- Telemetrie-Erweiterung: `"agl"`, `"pres"`, `"temp"`, `"rssi"` hinzugefügt

#### Pre-flight Check
- Vor Mission-Start werden 5 Checks durchgeführt:
  - `NO_MISSION` — keine Mission geladen
  - `BARO_FAIL` — Barometer nicht initialisiert
  - `NO_GPS_FIX` — kein GPS-Fix
  - `LOW_SATS` — weniger als 6 Satelliten
  - `NO_HOME` — kein Homepoint gesetzt
- Fehlschlag → LoRa-Antwort `{"type":"preflight","id":N,"ok":0,"fail":"..."}`, kein Armen

#### Zeitsynchronisation
- `{"cmd":"timesync","t":ground_ms}` → Drohne berechnet `sync_offset`
- `{"cmd":"start","at":target_ms}` → Drohne startet genau zum angegebenen Zeitpunkt
- Ermöglicht präzisen synchronen Missionsstart aller Drohnen im Schwarm

#### Blackbox
- Ring-Buffer: 400 Einträge (~14 KB RAM), CSV-Format auf SD-Karte
- Datei `/bb_<id>.csv` wird beim Armen geöffnet, alle 2 s geflusht, beim Disarmen geschlossen
- Felder: `t_ms, roll, pitch, yaw_r, agl, pres, m1, m2, m3, m4, mode, wp`
- Aufzeichnung ~25 Hz

---

### Gateway — `AccessPoint_ESP32.ino`

- **Komplett neu geschrieben**: WiFi/UDP-Architektur ersetzt durch SX1262 LoRa
- Gleiche LoRa-Parameter wie Drohnen (868 MHz, SF7, BW125, CR4/5, SyncWord 0xAB)
- USB-Serial-Protokoll zu PC beibehalten (JSON, newline-terminated)
- Neue Befehle vom PC:
  - `{"cmd":"send","to":1,"seq":5,"payload":{...}}` — gezielte Drohne
  - `{"cmd":"broadcast","seq":6,"payload":{...}}` — alle Drohnen
  - `{"cmd":"timesync"}` — Gateway broadcastet Zeitsync mit eigenem `millis()` an alle Drohnen
- Empfangene LoRa-Pakete werden mit `"gw_rssi"` Feld an PC weitergeleitet
- ACK-Pakete von Drohnen werden transparent durchgereicht

---

### Web-App — Multi-Drone Control

#### Mission-Format (Breaking Change)
- `yaw`, `pitch`, `roll` aus Waypoints entfernt — Attitude kommt ausschließlich vom Positionsregler
- `fn` (Farbfunktion) und `fp` (Parameter) zu Waypoints hinzugefügt
- LED-Farben werden jetzt korrekt interpoliert (war zuvor immer `255,255,255`)

#### KeyframeEditor (`KeyframeEditor.jsx`)
- `Yaw` und `Pitch` Felder entfernt
- LED-Farbfunktion editierbar: Dauerlicht / Puls / Strobe mit konfigurierbarem Parameter

#### MissionExport (`MissionExport.jsx`)
- Exportiert neues Waypoint-Format (ohne Winkel, mit `fn`/`fp`)
- Geschwindigkeitswarnungen übersetzt

#### DronePanel (`DronePanel.jsx`)
- Telemetrie-Anzeige pro Drohne: Armed-Status, Flugmodus, AGL-Höhe, RSSI-Signalbalken, GPS, Druck, Temperatur, Waypoint
- Vorflugcheck-Ergebnis wird angezeigt (grün OK / rot mit Fehlercode)
- Neuer **Landen**-Button (sanfte Notlandung)
- Modus-Namen: 0=Deaktiviert, 1=Stabilize, 2=Mission, 3=RTH, 4=Landen

#### Verbindung (`droneConnection.js`)
- Sequenznummern (`_seq`) für alle Befehle
- Neue Methoden: `softLand()`, `sendTimesync()`, `startMissionAt(droneIP, droneId, groundMs)`
- `sendMission()` bereinigt (ohne Winkelfelder)
- Preflight-Nachrichten werden an `onStatusCallback` weitergeleitet

#### MultiDroneControl (`MultiDroneControl.jsx`)
- `telemetry`-State (nach Drohnen-ID) für Echtzeit-Telemetrieanzeige
- `preflight`-State für Vorflugcheck-Ergebnisse
- `softLandDrone()` Funktion
- Zeitsync-Button in Toolbar
- Telemetrie-Handler identifiziert Drohnen über `data.id` (nicht nur IP)

#### Blackbox-Viewer (`BlackboxViewer.jsx`) — neu
- CSV-Import direkt im Browser (keine externen Bibliotheken)
- 3 SVG-Liniendiagramme: Höhe AGL, Motoren (M1–M4), Roll/Pitch
- Moduswechsel als farbige gestrichelte Vertikallinien
- Hover-Tooltip mit Zeitstempel und allen Messwerten
- Zusammenfassung: Dauer, Anzahl Datensätze, max. Höhe, Druckbereich

#### Interpolation (`interpolation.js`)
- `yaw`, `pitch`, `roll` aus Interpolationsergebnis entfernt
- RGB-Farben werden jetzt korrekt interpoliert
- `colorFn`/`colorFp` werden vom Ziel-Keyframe übernommen

---

### Internationalisierung (i18n)

- **Neues System**: `src/i18n/index.js` mit React Context und `useLanguage()` Hook
- **Sprachen**: Deutsch (Standard) und Englisch
- **Sprachumschalter**: `🇩🇪 DE` / `🇬🇧 EN` Button oben rechts im Header
- Sprache wird in `localStorage` gespeichert
- Übersetzte Komponenten: `DronePanel`, `KeyframeEditor`, `MissionExport`, `BlackboxViewer`, `MultiDroneControl`
- Neue Sprache hinzufügen: Block in `src/i18n/index.js` ergänzen

---

### Neue Abhängigkeiten (Arduino)
- `Adafruit BMP280 Library`
- `Adafruit Unified Sensor`
