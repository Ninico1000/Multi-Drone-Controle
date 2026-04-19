# ESP Drone v1 — Flight Controller

Custom PCB quadcopter flight controller based on the **ESP32-S2-WROVER** module.
Designed for coordinated multi-drone operation via **LoRa (SX1262)**.
Missions are planned in **Multi-Drone-Control** and exported as JSON to the SD card.

---

## Hardware Overview

| Component | Part | Interface |
|-----------|------|-----------|
| MCU | ESP32-S2-WROVER (240 MHz, 4 MB Flash, 2 MB PSRAM) | — |
| IMU | MPU-6050 (6-axis accel + gyro) | I2C bus 0 |
| Radio | SX1262IMLTRT (LoRa 868/915 MHz, +22 dBm max) | SPI HSPI |
| GPS | GEPRC M10 FPV (u-blox M10, 38400 Bd) | UART1 |
| Power | TPS563200 (buck, 4.5–17 V → 5 V, 3 A) | — |
| 3.3 V | AMS1117-3.3 (LDO, 5 V → 3.3 V) | — |
| LEDs | 16× WS2812B (RGB, daisy-chain) | IO26 (330 Ω) |
| Storage | Micro SD (FAT32) | SPI FSPI |
| Crystal | 32 MHz (SX1262 clock) | — |
| Motors | 4× JST EH 1×03 connectors J3–J6 | PWM 50 Hz |
| Antenna | SMA/coaxial J7 | LoRa RF |

---

## Pin Mapping (from KiCad PCB netlist)

### I2C bus 0 — MPU-6050
| Pin | Net |
|-----|-----|
| IO05 | SDA MPU |
| IO06 | SCL MPU |

### UART1 — GEPRC M10 FPV GPS
| Pin | Net |
|-----|-----|
| IO03 | GPS RX  (ESP32 RX ← GPS TX) |
| IO04 | GPS TX  (ESP32 TX → GPS RX) |

> Default baud: **38400** (u-blox M10 factory default).
> Override in `/config.txt` with `gps_baud=<value>`.

### ESC Motor PWM
| Pin | Motor | Position |
|-----|-------|----------|
| IO18 | ESC 1 | Front-Left  (CW)  |
| IO17 | ESC 2 | Front-Right (CCW) |
| IO16 | ESC 3 | Rear-Right  (CW)  |
| IO15 | ESC 4 | Rear-Left   (CCW) |

> 50 Hz, 1000–2000 µs (standard RC protocol)

### SPI HSPI — SX1262 LoRa
| Pin | SX1262 | |
|-----|--------|-|
| IO34 | SCK | |
| IO40 | MOSI | |
| IO41 | MISO | |
| IO39 | NSS | Chip Select |
| IO21 | NRESET | |
| IO38 | BUSY | |
| IO37 | DIO1 | RxDone / TxDone IRQ |
| IO36 | DIO2 | |
| IO35 | DIO3 | |

### SPI FSPI — Micro SD
| Pin | SD |
|-----|----|
| IO11 | CMD (MOSI) |
| IO12 | CLK |
| IO13 | DAT0 (MISO) |
| IO14 | DAT3 / CS |

---

## Power Architecture

```
Battery  2S–4S LiPo  (7.4–16.8 V)
        │
        ▼
   TPS563200 (buck 3 A) ──► +5 V ──► ESC connectors J3–J6
        │                             WS2812B chain
        ▼
   AMS1117-3.3 (LDO) ──► +3.3 V ──► ESP32-S2-WROVER
                                      MPU-6050
                                      SX1262
                                      GEPRC M10 FPV
```

---

## Motor Layout (X-Frame)

```
        FRONT
  M1 (CW) ──── M2 (CCW)
     \            /
      \    [PCB]  /
     /            \
  M4 (CCW) ── M3 (CW)
        REAR
```

**Mixer:**
```
M1 = base + roll − pitch + yaw
M2 = base − roll − pitch − yaw
M3 = base − roll + pitch + yaw
M4 = base + roll + pitch − yaw
```

---

## LoRa Protocol — JSON Text Packets

LoRa replaces WiFi entirely. All packets are UTF-8 JSON, ≤ 200 bytes.

### Commands: Ground → Drone

| JSON | Effect |
|------|--------|
| `{"cmd":"ping"}` | Drone replies with `{"type":"pong","id":N}` |
| `{"cmd":"start"}` | Begin executing mission loaded from SD |
| `{"cmd":"stop"}` | Stop mission, disarm |
| `{"cmd":"emergency"}` | Immediate motor cutoff |
| `{"cmd":"arm","thr":500,"r":0,"p":0,"y":0,"mode":1}` | Manual stabilize |
| `{"cmd":"reload"}` | Re-read `/mission.json` from SD card |

### Telemetry: Drone → Ground (every 200 ms)

```json
{
  "id": 1,
  "r": 0.1,   "p": -0.2,  "y": 3.1,
  "lat": 48.123456,  "lng": 11.456789,  "alt": 502.1,
  "arm": 1,  "mode": 2,  "wp": 12,  "bat": 0
}
```

| Field | Description |
|-------|-------------|
| `id` | Drone ID |
| `r/p/y` | Roll / pitch (°), yaw rate (°/s) |
| `lat/lng/alt` | GPS position |
| `arm` | 1 = armed |
| `mode` | 0=disarmed 1=stabilize 2=mission 3=return |
| `wp` | Current waypoint index |
| `bat` | Battery mV (0 = not wired) |

### LoRa Settings

| Parameter | Value |
|-----------|-------|
| Frequency | 868.0 MHz (EU) — change `LORA_FREQUENCY` for 915 MHz |
| Bandwidth | 125 kHz |
| Spreading Factor | SF7 |
| Coding Rate | 4/5 |
| Sync Word | `0xAB` (fleet-wide) |
| TX Power | 14 dBm |

---

## SD Card Files

### `/config.txt`

```
id=1
gps_baud=38400
```

| Key | Default | Description |
|-----|---------|-------------|
| `id` | `1` | Unique drone ID (1–255) |
| `gps_baud` | `38400` | GEPRC M10 baud rate |

### `/mission.json`

Exported from **Multi-Drone-Control → Mission Export**.
The drone reads this file at boot (and on `{"cmd":"reload"}`).

```json
{
  "version": "1.0",
  "drone": { "name": "Drohne-01", "ip": "192.168.1.101" },
  "mission": {
    "interpolationMode": "smooth",
    "duration": 60.0,
    "waypointInterval": 0.5,
    "homePoint":      { "lat": 48.12345, "lng": 11.45678 },
    "emergencyPoint": { "lat": 48.12300, "lng": 11.45600 },
    "geofence": {
      "center": { "lat": 48.12345, "lng": 11.45678 },
      "radius": 200
    }
  },
  "waypoints": [
    { "time": 0,   "x": 0, "y": 0, "z": 2, "yaw": 0, "pitch": 0, "roll": 0,
      "r": 0, "g": 200, "b": 255 },
    { "time": 0.5, "x": 0.1, "y": 0.2, "z": 2.1, "yaw": 5, "pitch": 0, "roll": 0,
      "r": 0, "g": 200, "b": 255 }
  ]
}
```

**Coordinate frame:** `x` = East, `y` = North, `z` = Up (metres, relative to `homePoint`).
**Max waypoints:** 400 (≈ 200 s at 0.5 s interval).

---

## Flight Modes

| Mode | Value | Description |
|------|-------|-------------|
| Disarmed | 0 | Motors off, PIDs reset |
| Stabilize | 1 | Manual control via LoRa `arm` command |
| Mission | 2 | Auto-execute `/mission.json` waypoints with GPS |
| Return | 3 | Reserved — fly to `homePoint` |

In **Mission mode** with GPS fix the drone uses a flat-earth ENU position loop:
position error (m) → attitude setpoints → attitude PID → motor mix.
Without GPS fix it falls back to the waypoint's `roll`/`pitch`/`yaw` fields directly.

---

## LED Status

| Pattern | Meaning |
|---------|---------|
| Orange solid | Booting |
| Green solid (1 s) | Ready |
| Blue slow pulse | Disarmed / idle |
| White front + Red rear + Waypoint colour sides | Armed / flying |

In mission mode the side LEDs track the interpolated `r,g,b` colour from the active waypoint.

---

## Required Libraries

| Library | Install |
|---------|---------|
| `RadioLib` | Arduino Library Manager |
| `MPU6050_light` | Arduino Library Manager |
| `TinyGPSPlus` | Arduino Library Manager |
| `Adafruit NeoPixel` | Arduino Library Manager |
| `ArduinoJson` | Arduino Library Manager |
| `SD` | Arduino built-in |

**Board:** `ESP32S2 Dev Module` — Espressif esp32 package ≥ 3.x

---

## Build Notes

- KiCad 9, 2-layer PCB
- Default track: 0.2 mm — widen 5 V power traces to ≥ 0.5 mm
- Via drill: 0.3 mm
- Gerbers in `Schem/`
