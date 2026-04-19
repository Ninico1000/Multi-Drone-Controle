# ESP-FLY Firmware v1.0

Complete rewrite of ESP-FLY drone firmware for seamless integration with the Multi-Drone Mission Planner system.

## 🎯 Features

✅ **WiFi Station Mode** - Auto-connects to DroneControl-AP with static IP
✅ **UDP Command Protocol** - JSON-based command reception (port 8888)
✅ **Mission Execution** - Keyframe interpolation and autonomous flight
✅ **Position Control** - 3-level PID architecture for stable flight
✅ **BLE AoA Integration** - Position fusion with IMU data
✅ **Telemetry Broadcasting** - Real-time status updates (10Hz, port 8889)
✅ **Safety Features** - Emergency stop, battery protection, geofencing
✅ **Multi-Drone Support** - Configure drone ID for network coexistence

---

## 📋 Table of Contents

- [Hardware Requirements](#hardware-requirements)
- [Quick Start](#quick-start)
- [Building and Flashing](#building-and-flashing)
- [Configuration](#configuration)
- [Testing](#testing)
- [System Architecture](#system-architecture)
- [Communication Protocol](#communication-protocol)
- [Troubleshooting](#troubleshooting)

---

## 🔧 Hardware Requirements

### Core Hardware
- **XIAO ESP32S3** module
- **ESP-FLY** board (coreless motor drivers)
- **MPU6050** IMU (I2C)
- **4x Coreless Motors** (7mm)
- **250mAh 1S LiPo** battery (3.7V)

### Pin Configuration
| Function | GPIO | Notes |
|----------|------|-------|
| Motor FL | GPIO5 | Front Left PWM |
| Motor FR | GPIO6 | Front Right PWM |
| Motor RR | GPIO7 | Rear Right PWM |
| Motor RL | GPIO4 | Rear Left PWM |
| I2C SDA  | GPIO6 | MPU6050 |
| I2C SCL  | GPIO7 | MPU6050 |
| Battery ADC | GPIO2 | Voltage divider |
| Status LED | GPIO21 | System status indicator |

### Network Requirements
- **ESP32 Access Point** running DroneControl-AP firmware
- **10 BLE Anchors** for positioning (optional but recommended)

---

## 🚀 Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd ESP-FLY-Firmware

# Install ESP-IDF v5.0 or later
# Follow: https://docs.espressif.com/projects/esp-idf/en/latest/get-started/
```

### 2. Configure Drone ID

Edit `main/config.h`:

```c
#define DRONE_ID 1  // Change to 2, 3, etc. for other drones
```

This sets the static IP to `192.168.4.<DRONE_ID + 1>`:
- Drone 1: 192.168.4.2
- Drone 2: 192.168.4.3
- Drone 3: 192.168.4.4

### 3. Build and Flash

```bash
idf.py set-target esp32s3
idf.py build
idf.py -p /dev/ttyUSB0 flash monitor
```

### 4. Verify Connection

Watch serial monitor for:

```
========================================
   ESP-FLY Firmware v1.0
   Multi-Drone Mission Control
========================================
Drone ID: 1

WiFi connected: 192.168.4.2
System Ready!
```

---

## 🔨 Building and Flashing

### Prerequisites

- ESP-IDF v5.0 or later
- Python 3.7+
- Serial driver for XIAO ESP32S3

### Build Commands

```bash
# Full clean build
idf.py fullclean
idf.py build

# Flash only
idf.py flash

# Flash and monitor
idf.py flash monitor

# Monitor only
idf.py monitor

# Menuconfig (advanced settings)
idf.py menuconfig
```

### Build Targets

- `esp32s3` - XIAO ESP32S3 (default)

### Partition Table

The firmware uses a custom partition table (`partitions.csv`) with OTA support:

- **factory**: 1MB (main firmware)
- **ota_0**: 1MB (OTA update slot 1)
- **ota_1**: 1MB (OTA update slot 2)

---

## ⚙️ Configuration

### WiFi Settings

Edit `main/config.h`:

```c
#define WIFI_SSID "DroneControl-AP"
#define WIFI_PASSWORD "drone12345"
#define DRONE_ID 1  // Unique ID per drone
```

### PID Tuning

Default PID values are in `config.h`. Tune these for your specific drone:

**Position PIDs** (converts position error → velocity):
```c
#define PID_POS_X_KP 1.0f
#define PID_POS_X_KI 0.01f
#define PID_POS_X_KD 0.5f
// ... Y and Z similar
```

**Attitude PIDs** (stabilization):
```c
#define PID_ROLL_KP 3.5f
#define PID_PITCH_KP 3.5f
#define PID_YAW_KP 2.5f
```

You can also tune PIDs live via UDP commands (see Protocol section).

### Safety Limits

```c
#define BATTERY_MIN_VOLTAGE 3.3f      // Emergency land
#define BATTERY_WARN_VOLTAGE 3.5f     // Return home warning
#define FLIGHT_AREA_SIZE 25.0f        // 25x25m geofence
```

### Control Loop Frequencies

```c
#define ATTITUDE_LOOP_FREQ_HZ 500   // 500Hz stabilization
#define POSITION_LOOP_FREQ_HZ 50    // 50Hz position control
#define MISSION_LOOP_FREQ_HZ 50     // 50Hz mission updates
#define TELEMETRY_RATE_HZ 10        // 10Hz telemetry broadcast
```

---

## 🧪 Testing

### Test Tool

A Python test tool is provided in `tools/test_commands.py`.

**Basic Usage:**

```bash
# Discovery test
python3 tools/test_commands.py --discover

# Upload simple hover mission
python3 tools/test_commands.py --simple

# Arm motors
python3 tools/test_commands.py --arm

# Start mission (PROPS OFF FIRST!)
python3 tools/test_commands.py --start

# Monitor telemetry for 30 seconds
python3 tools/test_commands.py --monitor 30

# Emergency stop
python3 tools/test_commands.py --emergency
```

**Test Missions:**

```bash
# Simple 2-point hover
python3 tools/test_commands.py --simple --start

# Square pattern
python3 tools/test_commands.py --square --start

# Circle pattern
python3 tools/test_commands.py --circle --start
```

### Manual UDP Commands (Linux/Mac)

```bash
# Discovery
echo '{"cmd":"ping"}' | nc -u 192.168.4.2 8888

# Arm motors
echo '{"cmd":"arm"}' | nc -u 192.168.4.2 8888

# Upload mission
echo '{"cmd":"mission","data":[{"t":0,"x":0,"y":0,"z":1.0,"yaw":0,"pitch":0,"roll":0},{"t":5,"x":0,"y":0,"z":1.0,"yaw":0,"pitch":0,"roll":0}]}' | nc -u 192.168.4.2 8888

# Start mission
echo '{"cmd":"start"}' | nc -u 192.168.4.2 8888

# Emergency stop
echo '{"cmd":"emergency"}' | nc -u 192.168.4.2 8888
```

### Testing Checklist

- [ ] Firmware builds without errors
- [ ] Drone boots and connects to WiFi
- [ ] Discovery responds with drone info
- [ ] Can upload mission via UDP
- [ ] Can arm/disarm motors
- [ ] Telemetry broadcasts at 10Hz
- [ ] Position updates are received
- [ ] Emergency stop works
- [ ] Battery voltage is read correctly
- [ ] **Ground test complete (PROPS OFF!)**
- [ ] **Flight test with simple hover**

---

## 🏗️ System Architecture

### Software Components

```
┌─────────────────────────────────────┐
│     React Web App (Browser)         │
└────────────┬────────────────────────┘
             ↓ WebSocket (3001)
┌─────────────────────────────────────┐
│    Node.js Bridge Server            │
└────────────┬────────────────────────┘
             ↓ Serial/USB (115200)
┌─────────────────────────────────────┐
│    ESP32 Access Point (192.168.4.1) │
└────────────┬────────────────────────┘
             ↓ WiFi UDP (8888/8889)
┌─────────────────────────────────────┐
│    ESP-FLY Drone (192.168.4.2)      │
│  ┌─────────────────────────────┐   │
│  │  Mission Control (50Hz)     │   │
│  │  - Keyframe interpolation   │   │
│  │  - Target calculation       │   │
│  └──────────┬──────────────────┘   │
│             ↓                       │
│  ┌─────────────────────────────┐   │
│  │  Position Controller (50Hz) │   │
│  │  - Position PIDs            │   │
│  │  - Velocity → attitude      │   │
│  └──────────┬──────────────────┘   │
│             ↓                       │
│  ┌─────────────────────────────┐   │
│  │  Attitude Control (500Hz)   │   │
│  │  - Roll/Pitch/Yaw PIDs      │   │
│  │  - Motor mixing             │   │
│  └──────────┬──────────────────┘   │
│             ↓                       │
│  ┌─────────────────────────────┐   │
│  │  Motors (PWM @ 16kHz)       │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

### RTOS Task Priorities

| Task | Priority | Frequency | Stack |
|------|----------|-----------|-------|
| Attitude Control | 20 (highest) | 500Hz | 4KB |
| Position Control | 15 | 50Hz | 4KB |
| Mission Execution | 12 | 50Hz | 4KB |
| UDP Commands | 10 | On demand | 4KB |
| BLE Positioning | 8 | On update | 2KB |
| Telemetry | 5 (lowest) | 10Hz | 2KB |

---

## 📡 Communication Protocol

### Commands TO Drone (Port 8888)

#### Mission Upload
```json
{
  "cmd": "mission",
  "data": [
    {"t": 0.0, "x": 0.0, "y": 0.0, "z": 1.0, "yaw": 0.0, "pitch": 0.0, "roll": 0.0},
    {"t": 5.0, "x": 3.0, "y": 3.0, "z": 1.5, "yaw": 45.0, "pitch": 0.0, "roll": 0.0}
  ]
}
```

#### Mission Control
```json
{"cmd": "start"}      // Start mission
{"cmd": "stop"}       // Stop/pause mission
{"cmd": "arm"}        // Arm motors
{"cmd": "disarm"}     // Disarm motors
{"cmd": "emergency"}  // Emergency stop
```

#### Position Update (from BLE AoA)
```json
{
  "cmd": "position",
  "x": 1.5,
  "y": 2.3,
  "z": 1.2,
  "accuracy": 0.15
}
```

#### PID Tuning
```json
{
  "cmd": "pid",
  "axis": "x",  // x, y, z, roll, pitch, yaw
  "kp": 1.5,
  "ki": 0.02,
  "kd": 0.6
}
```

#### Discovery
```json
{"cmd": "ping"}
```

**Response:**
```json
{
  "name": "Drone-01",
  "bleAddress": "D0:01",
  "firmware": "ESP-FLY-v1.0"
}
```

### Telemetry FROM Drone (Port 8889, 10Hz broadcast)

```json
{
  "x": 1.23,           // Current position X (m)
  "y": 2.34,           // Current position Y (m)
  "z": 1.50,           // Current position Z (m)
  "yaw": 45.2,         // Current yaw (degrees)
  "pitch": 2.1,        // Current pitch (degrees)
  "roll": -1.3,        // Current roll (degrees)
  "tx": 3.00,          // Target position X (m)
  "ty": 3.00,          // Target position Y (m)
  "tz": 1.50,          // Target position Z (m)
  "battery": 3.85,     // Battery voltage (V)
  "state": "flying",   // Mission state
  "mission_time": 5.23 // Current mission time (s)
}
```

**Mission States:**
- `idle` - Not armed
- `armed` - Motors armed, ready to fly
- `takeoff` - Taking off
- `flying` - Mission in progress
- `hovering` - Paused/holding position
- `landing` - Landing
- `emergency` - Emergency mode

---

## 🐛 Troubleshooting

### Build Issues

**Error: `esp_wifi.h` not found**
- Solution: Ensure ESP-IDF is installed and sourced:
  ```bash
  . $HOME/esp/esp-idf/export.sh
  ```

**Error: Target mismatch**
- Solution: Set correct target:
  ```bash
  idf.py set-target esp32s3
  ```

### Connection Issues

**Drone not connecting to WiFi**
- Check SSID and password in `config.h`
- Verify Access Point is running
- Check serial monitor for WiFi errors
- Verify ESP32 AP is in range

**No telemetry received**
- Check firewall settings on PC
- Verify UDP port 8889 is not blocked
- Use Wireshark to capture UDP packets
- Try: `nc -ul 8889` to listen manually

**Commands not working**
- Verify drone IP address (ping 192.168.4.2)
- Check command JSON format
- Look for parsing errors in serial monitor
- Try discovery first: `{"cmd":"ping"}`

### Flight Issues

**Drone won't arm**
- Check battery voltage (must be > 3.3V)
- Verify position fix (BLE AoA must be working)
- Check for emergency mode
- Look for safety errors in serial monitor

**Erratic flight**
- Lower PID gains (reduce Kp by 50%)
- Check motor connections (FL, FR, RR, RL)
- Calibrate IMU (keep level during boot)
- Verify position accuracy (< 0.5m)

**Position drift**
- Improve BLE positioning accuracy
- Increase position update rate
- Check for interference
- Recalibrate anchor positions

**Battery drains too fast**
- Check motor efficiency
- Reduce max throttle
- Optimize PID parameters
- Consider larger battery

### Serial Monitor Messages

**`[SAFETY] Battery critical`**
- Charge or replace battery immediately
- Drone will emergency land

**`[SAFETY] Position lost`**
- BLE positioning system not working
- Check anchor power and placement
- Verify BLE configuration

**`[SAFETY] Geofence violation`**
- Drone exceeded flight area bounds
- Mission will stop automatically
- Check waypoint coordinates

**`[MISSION] Mission upload failed`**
- Too many keyframes (max 100)
- Invalid keyframe data
- Check JSON format

---

## 📚 Additional Documentation

- **BUILD.md** - Detailed build instructions
- **PID_TUNING.md** - PID tuning guide
- **CALIBRATION.md** - Sensor calibration procedures
- **SAFETY.md** - Safety features and failsafes

---

## 🤝 Support

- GitHub Issues: <repository-url>/issues
- ESP-IDF Documentation: https://docs.espressif.com/projects/esp-idf/
- Multi-Drone Mission Planner: See main project README

---

## 📄 License

[Your License Here]

---

## ✅ Success Criteria

Your ESP-FLY firmware is working correctly when:

- [x] Firmware builds and flashes successfully
- [x] Drone boots and connects to DroneControl-AP
- [x] Discovery responds with drone information
- [x] Can upload missions via UDP
- [x] Can arm/disarm motors via commands
- [x] Telemetry broadcasts at stable 10Hz
- [x] Position updates are received and processed
- [x] Emergency stop works reliably
- [x] Battery monitoring reports correct voltage
- [x] Drone executes simple hover mission
- [x] Drone follows multi-waypoint missions
- [x] React Mission Planner can control drone

---

**Happy Flying! 🚁**
