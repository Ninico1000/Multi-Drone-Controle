# ESP-FLY vs ESP-Drone Firmware Comparison

Complete comparison between ESP-FLY firmware and ESP-Drone firmware.

---

## 📋 Executive Summary

The ESP-FLY firmware is a **complete rewrite** designed specifically for autonomous multi-drone control via WiFi/UDP, while ESP-Drone is designed for manual control via cell phone app using CRTP (Crazyflie Radio Transport Protocol).

### Key Differences

| Feature | ESP-Drone | ESP-FLY |
|---------|-----------|---------|
| **Control Mode** | Manual (via app) | Autonomous (via mission planner) |
| **Network Mode** | WiFi AP (drone creates hotspot) | WiFi Station (connects to PC AP) |
| **Communication** | CRTP over UDP | JSON over UDP |
| **Protocol** | SBUS-like control signals | JSON mission commands |
| **Primary Use** | Manual flying with phone | Waypoint-based autonomous missions |
| **Positioning** | Manual/IMU only | BLE AoA (10 anchors) + IMU fusion |
| **Control Architecture** | 2-level (Attitude + Stabilizer) | 3-level (Position + Attitude + Stabilizer) |
| **Multi-Drone** | Single drone focus | Fleet management (multiple drones) |
| **Telemetry** | CRTP packets | JSON telemetry broadcast (10Hz) |

---

## 🏗️ Architecture Comparison

### ESP-Drone Architecture

```
Phone App (Cfclient)
    ↓ WiFi
ESP-Drone (Access Point Mode)
    ↓ CRTP Protocol
┌─────────────────────────────┐
│  WiFi Link (CRTP Handler)   │
│  - Receives CRTP packets    │
│  - Decodes control commands │
└──────────┬──────────────────┘
           ↓
┌─────────────────────────────┐
│  Commander                  │
│  - Setpoint management      │
│  - Priority arbitration     │
└──────────┬──────────────────┘
           ↓
┌─────────────────────────────┐
│  Attitude Controller (PID)  │
│  - Roll/Pitch/Yaw PIDs      │
└──────────┬──────────────────┘
           ↓
┌─────────────────────────────┐
│  Stabilizer (500Hz)         │
│  - Motor mixing             │
│  - Power distribution       │
└──────────┬──────────────────┘
           ↓ PWM
       Motors
```

**Control Flow:**
1. User moves joystick in app
2. App sends SBUS-like signals wrapped in CRTP
3. Drone receives and decodes to roll/pitch/yaw/throttle
4. Attitude stabilization maintains drone level
5. Motors respond to mixed commands

### ESP-FLY Architecture

```
React Web App (Mission Planner)
    ↓ WebSocket (port 3001)
Node.js Bridge Server
    ↓ Serial/USB (115200 baud)
ESP32 Access Point (DroneControl-AP)
    ↓ WiFi UDP (8888/8889)
ESP-FLY Drone (Station Mode)
    ↓ JSON Protocol
┌─────────────────────────────┐
│  UDP Handler                │
│  - JSON command parser      │
│  - Mission upload           │
│  - PID tuning commands      │
└──────────┬──────────────────┘
           ↓
┌─────────────────────────────┐
│  Mission Control (50Hz)     │
│  - Keyframe interpolation   │
│  - Target calculation       │
└──────────┬──────────────────┘
           ↓ Target position
┌─────────────────────────────┐
│  Position Controller (50Hz) │
│  - Position PIDs (X, Y, Z)  │
│  - Velocity → Attitude      │
└──────────┬──────────────────┘
           ↓ Attitude command
┌─────────────────────────────┐
│  Attitude Controller (500Hz)│
│  - Roll/Pitch/Yaw PIDs      │
│  - Motor mixing             │
└──────────┬──────────────────┘
           ↓
┌─────────────────────────────┐
│  IMU Task (500Hz)           │
│  - MPU6050 readings         │
│  - Complementary filter     │
└──────────┬──────────────────┘
           ↓ PWM
       Motors
```

**Control Flow:**
1. Mission planner sends waypoint mission (JSON)
2. Drone stores keyframes and starts mission
3. Mission control interpolates current target position
4. Position controller converts position error to attitude command
5. Attitude controller stabilizes to desired attitude
6. IMU provides feedback for closed-loop control

---

## 🔌 Pin Configuration Comparison

### ESP-Drone (Standard Build)

```
Motors:
- M1 (Rear Left):  GPIO 7
- M2 (Rear Right): GPIO 4
- M3 (Front Left): GPIO 3
- M4 (Front Right): GPIO 1

I2C (Sensors):
- SDA: GPIO 5
- SCL: GPIO 6

I2C (Deck - Optional):
- SDA: GPIO 40
- SCL: GPIO 41
```

### ESP-FLY (Updated to Match ESP-Drone)

```
Motors:
- Front Left:  GPIO 3  (matches M3)
- Front Right: GPIO 1  (matches M4)
- Rear Right:  GPIO 4  (matches M2)
- Rear Left:   GPIO 7  (matches M1)

I2C (MPU6050):
- SDA: GPIO 5
- SCL: GPIO 6

Battery ADC:
- ADC: GPIO 2

Status LED:
- LED: GPIO 21
```

✅ **Pin compatible** - ESP-FLY now uses the same pins as ESP-Drone for motors and I2C!

---

## 📡 Protocol Comparison

### ESP-Drone: CRTP (Crazyflie Radio Transport Protocol)

**Packet Format:**
```c
struct CRTPPacket {
    uint8_t header;    // Port and channel
    uint8_t data[31];  // Payload
    uint8_t size;      // Data size
};
```

**Control Packet (CRTP_PORT_SETPOINT):**
```
Header: 0x03 (Port 3, Channel 0)
Data: [roll(4 bytes), pitch(4 bytes), yaw(4 bytes), thrust(2 bytes)]
```

**Legacy App Compatibility:**
- Receives SBUS-like signals (12 bytes)
- Decodes to roll/pitch/yaw/thrust
- Range: -15° to +15° for angles

**Disadvantages:**
- Binary protocol (hard to debug)
- Designed for manual control
- No mission storage
- No waypoint support

### ESP-FLY: JSON over UDP

**Mission Upload:**
```json
{
  "cmd": "mission",
  "data": [
    {"t": 0.0, "x": 0.0, "y": 0.0, "z": 1.0, "yaw": 0.0, "pitch": 0.0, "roll": 0.0},
    {"t": 5.0, "x": 3.0, "y": 3.0, "z": 1.5, "yaw": 45.0, "pitch": 0.0, "roll": 0.0}
  ]
}
```

**Control Commands:**
```json
{"cmd": "start"}
{"cmd": "stop"}
{"cmd": "emergency"}
{"cmd": "arm"}
{"cmd": "disarm"}
```

**Position Update (from BLE):**
```json
{
  "cmd": "position",
  "x": 1.5,
  "y": 2.3,
  "z": 1.2,
  "accuracy": 0.15
}
```

**PID Tuning:**
```json
{
  "cmd": "pid",
  "axis": "x",
  "kp": 1.5,
  "ki": 0.05,
  "kd": 0.8
}
```

**Telemetry (10Hz broadcast):**
```json
{
  "x": 1.23, "y": 2.34, "z": 1.50,
  "yaw": 45.2, "pitch": 2.1, "roll": -1.3,
  "tx": 3.00, "ty": 3.00, "tz": 1.50,
  "battery": 3.85, "state": "flying", "mission_time": 5.23
}
```

**Advantages:**
- Human-readable (easy debugging)
- Flexible (add fields without breaking)
- Mission-based (store keyframes)
- Autonomous flight
- Live parameter tuning

---

## 🎮 Control System Comparison

### ESP-Drone: 2-Level Manual Control

**Level 1: Commander**
- Receives setpoints from phone app
- Priority management
- Watchdog protection

**Level 2: Attitude Controller**
- PID control for roll/pitch/yaw
- Maintains desired attitude
- Motor mixing

**Characteristics:**
- User directly controls attitude
- No position holding
- Drone drifts without input
- Requires constant joystick control
- Good for acrobatic flying

### ESP-FLY: 3-Level Autonomous Control

**Level 1: Mission Control**
- Keyframe interpolation
- Target position calculation
- Progress tracking

**Level 2: Position Controller**
- PID control for X, Y, Z position
- Converts position error to velocity
- Velocity to attitude conversion

**Level 3: Attitude Controller**
- PID control for roll/pitch/yaw
- Stabilizes to desired attitude
- Motor mixing

**Characteristics:**
- Fully autonomous waypoint following
- Position holding (with BLE AoA)
- Smooth trajectory interpolation
- No user input during mission
- Good for choreography and surveys

---

## 🛠️ Firmware Structure Comparison

### ESP-Drone File Organization

```
esp-drone/
├── components/
│   ├── core/crazyflie/
│   │   ├── hal/
│   │   │   ├── src/wifilink.c        # CRTP WiFi handler
│   │   │   ├── src/sensors.c         # Sensor management
│   │   │   └── interface/            # Header files
│   │   ├── modules/
│   │   │   ├── src/commander.c       # Setpoint manager
│   │   │   ├── src/stabilizer.c      # Main control loop
│   │   │   ├── src/attitude_pid_controller.c
│   │   │   └── src/position_controller.c (basic)
│   │   └── utils/
│   ├── drivers/
│   │   ├── general/wifi/wifi_esp32.c # WiFi AP mode
│   │   ├── general/motors/motors.c   # Motor drivers
│   │   └── i2c_devices/mpu6050/      # MPU6050 driver
│   └── lib/
│       └── dsp_lib/                   # PID and math functions
└── main/
    └── main.c                         # Entry point
```

**Key Files:**
- `wifi_esp32.c`: WiFi AP creation, UDP server (port 2390)
- `wifilink.c`: CRTP packet handler
- `stabilizer.c`: 500Hz control loop
- `commander.c`: Setpoint arbitration

### ESP-FLY File Organization

```
ESP-FLY-Firmware/
└── main/
    ├── config.h                # Central configuration
    ├── app_main.c              # Entry point
    ├── wifi_manager.c/h        # WiFi STATION mode
    ├── udp_handler.c/h         # JSON UDP protocol
    ├── mission_control.c/h     # Mission execution
    ├── position_controller.c/h # Position PIDs
    ├── attitude_controller.c/h # Attitude PIDs + motors
    ├── imu_mpu6050.c/h         # IMU driver
    ├── ble_positioning.c/h     # BLE AoA integration
    ├── telemetry.c/h           # Telemetry formatting
    └── safety.c/h              # Safety features
```

**Key Files:**
- `wifi_manager.c`: WiFi station mode, connects to AP
- `udp_handler.c`: JSON command parser (port 8888/8889)
- `mission_control.c`: Keyframe interpolation
- `position_controller.c`: X/Y/Z position PIDs
- `attitude_controller.c`: Roll/pitch/yaw PIDs + motor mixing
- `imu_mpu6050.c`: Simplified MPU6050 driver

---

## 🔄 What Was Removed from ESP-Drone

### ❌ Removed Features

1. **CRTP Protocol**
   - Removed CRTP packet handling
   - Removed CRTP port/channel system
   - Removed legacy app compatibility

2. **WiFi Access Point Mode**
   - ESP-Drone creates its own AP
   - ESP-FLY connects to external AP

3. **Commander Module**
   - ESP-Drone has complex priority arbitration
   - ESP-FLY has direct mission → position → attitude flow

4. **Multi-Sensor Support**
   - ESP-Drone supports BMI088, BMP388, HMC5883L, MS5611
   - ESP-FLY uses MPU6050 only (simpler)

5. **Deck Support**
   - ESP-Drone has deck I2C bus for expansion
   - ESP-FLY is minimal (no deck support)

6. **Parameter System**
   - ESP-Drone has complex param storage/retrieval
   - ESP-FLY uses live UDP commands for tuning

7. **Logging System**
   - ESP-Drone has CRTP logging framework
   - ESP-FLY has simple telemetry broadcast

8. **SBUS Signal Decoding**
   - ESP-Drone decodes SBUS-like control signals
   - ESP-FLY uses JSON commands

---

## ✅ What Was Added to ESP-FLY

### ✨ New Features

1. **Mission Control System**
   - Keyframe storage (up to 100)
   - Linear and smooth interpolation
   - Progress tracking
   - State machine

2. **Position Controller**
   - Independent X, Y, Z PIDs
   - Velocity to attitude conversion
   - Geofencing

3. **JSON Protocol**
   - Mission upload via UDP
   - Position updates from BLE
   - Live PID tuning
   - Discovery/ping support

4. **BLE AoA Integration**
   - Receives position from 10 anchors
   - Complementary filter with IMU
   - Accuracy-based weighting

5. **JSON Telemetry**
   - 10Hz broadcast
   - Human-readable
   - Real-time position and targets

6. **Safety Features**
   - Emergency stop
   - Battery protection
   - Position loss detection
   - Command timeout failsafe
   - Geofencing (25x25m)

7. **WiFi Station Mode**
   - Connects to PC's Access Point
   - Static IP assignment per drone
   - Multi-drone support (fleet)

8. **Simplified IMU Driver**
   - MPU6050 only
   - Complementary filter
   - 500Hz updates

---

## 🔢 Code Size Comparison

### ESP-Drone (Full Build)

```
Components: ~50+ source files
Lines of Code: ~15,000+ lines (excluding libraries)
Binary Size: ~1.2 MB (with all features)
Features: Full Crazyflie compatibility
```

### ESP-FLY (Mission-focused)

```
Components: ~10 source files
Lines of Code: ~2,600 lines
Binary Size: ~150 KB (estimated)
Features: Mission control + autonomous flight
```

**Reduction:** ~85% smaller codebase, focused on autonomous missions only.

---

## 🚀 Performance Comparison

| Metric | ESP-Drone | ESP-FLY |
|--------|-----------|---------|
| Control Loop | 500Hz attitude | 500Hz attitude + 50Hz position |
| Telemetry Rate | Variable (CRTP) | 10Hz fixed (JSON) |
| Command Latency | ~20-50ms | ~50-100ms (JSON parsing) |
| Position Accuracy | IMU only (drift) | BLE AoA (0.1-0.3m) |
| Max Flight Time | Depends on battery | Depends on battery |
| CPU Usage | ~30-40% | ~25-35% |
| RAM Usage | ~80KB | ~50KB |

---

## 🔧 When to Use Each Firmware

### Use ESP-Drone When:
- ✅ Manual flying with phone app
- ✅ Acrobatic flying (flips, rolls)
- ✅ Learning drone control
- ✅ Testing new sensors (deck support)
- ✅ Crazyflie compatibility needed
- ✅ Single drone operation

### Use ESP-FLY When:
- ✅ Autonomous waypoint missions
- ✅ Multi-drone choreography
- ✅ Precise positioning (with BLE AoA)
- ✅ Fleet management (multiple drones)
- ✅ Surveying or mapping
- ✅ Light shows or performances
- ✅ Research (swarm behavior)

---

## 📝 Migration Path

### From ESP-Drone to ESP-FLY

If you have ESP-Drone hardware and want to switch to ESP-FLY:

1. **Backup ESP-Drone firmware**
   ```bash
   esptool.py read_flash 0 0x400000 esp-drone-backup.bin
   ```

2. **Flash ESP-FLY firmware**
   ```bash
   cd ESP-FLY-Firmware
   idf.py build flash
   ```

3. **Update network configuration**
   - ESP-Drone: Drone creates AP
   - ESP-FLY: Connect to PC's DroneControl-AP

4. **Switch from phone app to mission planner**
   - ESP-Drone: Use Cfclient app
   - ESP-FLY: Use React Mission Planner

5. **Add BLE positioning (optional)**
   - ESP-Drone: IMU only
   - ESP-FLY: Set up 10 BLE anchors for positioning

### Rollback to ESP-Drone

```bash
esptool.py write_flash 0x0 esp-drone-backup.bin
```

---

## 🎯 Summary

| Aspect | ESP-Drone | ESP-FLY |
|--------|-----------|---------|
| **Purpose** | Manual RC flying | Autonomous missions |
| **Network** | WiFi AP (drone) | WiFi Station (PC AP) |
| **Protocol** | CRTP (binary) | JSON (text) |
| **Control** | Joystick (phone) | Waypoints (mission planner) |
| **Positioning** | IMU only | BLE AoA + IMU |
| **Codebase** | ~15K lines | ~2.6K lines |
| **Complexity** | High (full Crazyflie stack) | Low (mission-focused) |
| **Multi-Drone** | Single | Fleet (multiple) |
| **Learning Curve** | Steep | Moderate |
| **Flexibility** | High (many sensors) | Medium (mission-focused) |

---

**Conclusion:**

ESP-Drone and ESP-FLY serve **different purposes**. ESP-Drone is a general-purpose drone platform for manual control, while ESP-FLY is specialized for autonomous multi-drone missions with precise positioning.

ESP-FLY firmware was built from scratch to be:
- **Simpler** (85% less code)
- **Mission-focused** (autonomous waypoint navigation)
- **Multi-drone ready** (fleet management built-in)
- **Position-aware** (BLE AoA integration)
- **Easy to debug** (JSON protocol)

Both firmwares are compatible with the same hardware pins, making it easy to switch between them!

---

*Last Updated: 2025-12-03*
*ESP-FLY Firmware v1.0 vs ESP-Drone*
