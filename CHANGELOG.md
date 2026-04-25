# Changelog
 
## 2026-04-25 — Multi-Drone Control & ESP Drone v1
 
---
 
### Hardware Changes (KiCad)
 
- **BMP280 barometer** added to the board — I²C bus 0, shared with MPU-6050 (IO05/IO06)
- **GPS I²C connection** added — IO01 (SDA) / IO02 (SCL) for u-blox M10 DDC interface
- GPS connector expanded to 6-pin JST-EH (UART + I²C + power)
- Gerbers and BOM updated (PCBWay production data)
---
 
### Firmware — `esp_drone_v1.ino`
 
#### New Hardware Support
- **BMP280 barometer** integrated (`Adafruit_BMP280`, I²C bus 0)
  - Sampling: NORMAL, pressure ×16, filter ×16, standby 1 ms
  - AGL calculation: `baro_alt - baro_home_alt` (zero point is set on arming)
- **GPS I²C pins** defined (IO01/IO02); GPS communication remains on UART
#### SD Card / Mission
- `mission.json` is fully loaded into RAM on boot (`mission_buf[25600]`)
- `{"cmd":"reload"}` re-parses the RAM buffer — no SD access at runtime
- New mission JSON structure: `yaw`, `pitch`, `roll` removed; `fn`/`fp` (LED color function) added
#### Flight Control
- Altitude controller (RTH, mission, landing) uses barometer altitude exclusively instead of GPS altitude
- New **LED color functions**: `fn=0` solid, `fn=1` pulse (period in `fp` ms), `fn=2` strobe (interval in `fp` ms)
- `baro_home_alt` is captured on arming and on mission start
#### Emergency Modes
- `{"cmd":"land"}` → **Soft landing (Mode 4)**: controlled descent at 0.4 m/s, disarm at 15 cm AGL
- `{"cmd":"emergency"}` → **Hard cutoff**: immediate motor stop without descent
#### LoRa Protocol
- **Addressing**: commands with `"to": drone_id` (or `0` = broadcast) — drones ignore foreign packets
- **Sequence numbers**: `"seq"` in commands; drone ACKs with `{"type":"ack","id":N,"seq":S}`
- **TDMA telemetry**: each drone transmits in its own time slot (`(id-1) × 50 ms`) → no collisions with up to 4 drones
- **RSSI** in telemetry packets (`"rssi"` field)
- Telemetry extended: `"agl"`, `"pres"`, `"temp"`, `"rssi"` added
#### Pre-flight Check
- Before mission start, 5 checks are performed:
  - `NO_MISSION` — no mission loaded
  - `BARO_FAIL` — barometer not initialized
  - `NO_GPS_FIX` — no GPS fix
  - `LOW_SATS` — fewer than 6 satellites
  - `NO_HOME` — no home point set
- On failure → LoRa response `{"type":"preflight","id":N,"ok":0,"fail":"..."}`, no arming
#### Time Synchronization
- `{"cmd":"timesync","t":ground_ms}` → drone calculates `sync_offset`
- `{"cmd":"start","at":target_ms}` → drone starts exactly at the specified time
- Enables precise synchronized mission start of all drones in the swarm
#### Blackbox
- Ring buffer: 400 entries (~14 KB RAM), CSV format on SD card
- File `/bb_<id>.csv` is opened on arming, flushed every 2 s, closed on disarming
- Fields: `t_ms, roll, pitch, yaw_r, agl, pres, m1, m2, m3, m4, mode, wp`
- Recording at ~25 Hz
---
 
### Gateway — `AccessPoint_ESP32.ino`
 
- **Completely rewritten**: WiFi/UDP architecture replaced with SX1262 LoRa
- Same LoRa parameters as the drones (868 MHz, SF7, BW125, CR4/5, sync word 0xAB)
- USB serial protocol to PC retained (JSON, newline-terminated)
- New commands from PC:
  - `{"cmd":"send","to":1,"seq":5,"payload":{...}}` — targeted drone
  - `{"cmd":"broadcast","seq":6,"payload":{...}}` — all drones
  - `{"cmd":"timesync"}` — gateway broadcasts time sync with its own `millis()` to all drones
- Received LoRa packets are forwarded to the PC with a `"gw_rssi"` field
- ACK packets from drones are passed through transparently
---
 
### Web App — Multi-Drone Control
 
#### Mission Format (Breaking Change)
- `yaw`, `pitch`, `roll` removed from waypoints — attitude comes exclusively from the position controller
- `fn` (color function) and `fp` (parameter) added to waypoints
- LED colors are now interpolated correctly (previously always `255,255,255`)
#### KeyframeEditor (`KeyframeEditor.jsx`)
- `Yaw` and `Pitch` fields removed
- LED color function editable: solid / pulse / strobe with configurable parameter
#### MissionExport (`MissionExport.jsx`)
- Exports new waypoint format (no angles, with `fn`/`fp`)
- Speed warnings translated
#### DronePanel (`DronePanel.jsx`)
- Per-drone telemetry display: armed status, flight mode, AGL altitude, RSSI signal bars, GPS, pressure, temperature, waypoint
- Pre-flight check result is shown (green OK / red with error code)
- New **Land** button (soft emergency landing)
- Mode names: 0 = Disabled, 1 = Stabilize, 2 = Mission, 3 = RTH, 4 = Land
#### Connection (`droneConnection.js`)
- Sequence numbers (`_seq`) for all commands
- New methods: `softLand()`, `sendTimesync()`, `startMissionAt(droneIP, droneId, groundMs)`
- `sendMission()` cleaned up (no angle fields)
- Pre-flight messages are forwarded to `onStatusCallback`
#### MultiDroneControl (`MultiDroneControl.jsx`)
- `telemetry` state (keyed by drone ID) for real-time telemetry display
- `preflight` state for pre-flight check results
- `softLandDrone()` function
- Time sync button in the toolbar
- Telemetry handler identifies drones via `data.id` (not just IP)
#### Blackbox Viewer (`BlackboxViewer.jsx`) — new
- CSV import directly in the browser (no external libraries)
- 3 SVG line charts: AGL altitude, motors (M1–M4), roll/pitch
- Mode changes shown as colored dashed vertical lines
- Hover tooltip with timestamp and all measured values
- Summary: duration, number of records, max altitude, pressure range
#### Interpolation (`interpolation.js`)
- `yaw`, `pitch`, `roll` removed from interpolation result
- RGB colors are now interpolated correctly
- `colorFn`/`colorFp` are taken from the target keyframe
---
 
### Internationalization (i18n)
 
- **New system**: `src/i18n/index.js` with React Context and `useLanguage()` hook
- **Languages**: German (default) and English
- **Language switcher**: `🇩🇪 DE` / `🇬🇧 EN` button at the top right of the header
- Language is saved in `localStorage`
- Translated components: `DronePanel`, `KeyframeEditor`, `MissionExport`, `BlackboxViewer`, `MultiDroneControl`
- Adding a new language: add a block in `src/i18n/index.js`
---
 
### New Dependencies (Arduino)
- `Adafruit BMP280 Library`
- `Adafruit Unified Sensor`
 
