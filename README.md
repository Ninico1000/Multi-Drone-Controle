# Multi-Drone Mission Planner

A React-based mission planning system for controlling multiple drones using a 10-anchor BLE AoA positioning system with 0.1-0.3m accuracy.

## Features

- **3D Visualization**: Interactive Three.js scene with 25x25m flight area
- **10-Anchor BLE AoA System**: High-precision positioning
- **Keyframe-Based Missions**: Timeline editor with smooth/linear interpolation
- **Multi-Drone Support**: Control up to 3 drones simultaneously
- **Arduino Code Generation**: Automatic generation of PID-controlled flight code
- **Formation Flying**: Preset formations (circle, line, triangle)
- **Mission Save/Load**: JSON-based mission storage
- **Emergency Stop**: Safety features for immediate landing

## Project Structure

```
Multi Drone Control/
├── public/
│   └── index.html              # HTML entry point
├── src/
│   ├── components/
│   │   ├── MultiDroneControl.jsx    # Main component with state management
│   │   ├── ThreeScene.jsx           # 3D visualization using Three.js
│   │   ├── DronePanel.jsx           # Drone status sidebar
│   │   ├── AnchorSetup.jsx          # Anchor configuration panel
│   │   ├── KeyframeEditor.jsx       # Keyframe editor component
│   │   ├── Timeline.jsx             # Timeline visualization
│   │   └── EventLog.jsx             # Event logging component
│   ├── constants/
│   │   └── defaults.js              # Default configurations and constants
│   ├── utils/
│   │   ├── interpolation.js         # Interpolation functions
│   │   ├── arduinoCodeGenerator.js  # Arduino code generation
│   │   └── fileOperations.js        # Mission save/load operations
│   ├── App.js                       # App component
│   ├── index.js                     # React entry point
│   └── index.css                    # Global styles with Tailwind
├── package.json                     # Dependencies and scripts
├── tailwind.config.js               # Tailwind CSS configuration
└── postcss.config.js                # PostCSS configuration
```

## Quick Start

**New Setup with ESP32 Access Point (Recommended):**

1. **Flash ESP32 Access Point** (`AccessPoint_ESP32.ino`)
2. **Flash ESP32 Drones** (`DroneControl.txt`)
3. **Connect ESP32 AP to PC** via USB
4. **Install dependencies** and run:

```bash
# Terminal 1: Bridge Server
cd server
npm install
npm start

# Terminal 2: React App
npm install
npm start
```

5. **Power on drones** - they auto-connect to ESP32 AP
6. **Click "Drohnen suchen"** in the web app
7. **Start flying!**

📖 **See [SETUP_GUIDE.md](SETUP_GUIDE.md) for detailed installation instructions**

## Installation

### 1. Install React App Dependencies
```bash
npm install
```

### 2. Install Bridge Server Dependencies
```bash
cd server
npm install
cd ..
```

## System Architecture

### Option 1: ESP32 Access Point (Recommended)

```
PC → USB → ESP32 AP → WiFi → Drones
```

- **ESP32 Access Point** creates dedicated WiFi network
- **Auto-discovers** drones on the network
- **Serial/USB** bridge for PC communication
- **No WiFi required** on PC

### Option 2: Direct UDP (Legacy)

```
PC → WiFi → Drones
```

- Requires PC with WiFi
- Manual IP configuration
- Use `npm run start:udp` in server folder

## Building for Production

```bash
npm run build
```

This creates an optimized production build in the `build/` directory.

## Usage

### 1. Check Bridge Status

Look for the **"Bridge OK"** indicator (green) in the top-right of the Drone Panel. If it shows "No Bridge" (red), make sure the bridge server is running.

### 2. Connect Drones

1. Click the WiFi icon next to each drone to mark it as "connected"
2. Verify the drone's IP address matches your ESP32 configuration
3. The position will update in real-time via telemetry once the drone is online

### 3. Create Missions

1. Click **"+ KF"** (Keyframe) to add waypoints for a drone
2. Edit keyframe parameters in the Keyframe Editor:
   - **Time**: When to reach this waypoint (seconds)
   - **X, Y, Z**: Position in meters
   - **Yaw, Pitch, Roll**: Orientation in degrees
3. Use formation presets for synchronized multi-drone patterns:
   - **Kreis**: Circle formation
   - **Linie**: Line formation

### 4. Upload Mission to Drone

1. Click **"Upload"** to send the mission to the ESP32 via WiFi/UDP
2. The drone will receive and store all keyframes
3. Check the Event Log for confirmation

### 5. Mission Control

Once uploaded, control the drone's mission execution:
- **Start**: Begin autonomous mission execution
- **Stop**: Pause/stop the current mission
- **E-Stop**: Emergency stop (immediate landing)

### 6. Live Simulation

Use the **"Play"** button in the main viewport to simulate missions locally without sending to drones. This is useful for testing and visualization.

### 7. Mission Management

- **Speichern**: Export mission as JSON file
- **Laden**: Import previously saved missions
- Missions include all keyframes, interpolation settings, and anchor configuration

## Communication Architecture

### Serial Bridge Mode (Default)

```
React Web App (Browser)
      ↓ WebSocket (port 3001)
Node.js Bridge Server
      ↓ Serial/USB (115200 baud, JSON)
ESP32 Access Point (192.168.4.1)
      ↓ WiFi UDP (ports 8888/8889)
ESP32 Drones (192.168.4.2+)
      ↑ Telemetry (10Hz, JSON)
```

### Protocols

#### 1. WebSocket (React ↔ Bridge Server)

**Commands from React:**
```json
{
  "command": "discover"  // Find drones
}
{
  "droneIP": "192.168.4.2",
  "payload": {"cmd": "mission", "data": [...]}
}
```

**Responses to React:**
```json
{
  "type": "drone_list",
  "drones": [{"ip": "192.168.4.2", "name": "Drone-01"}]
}
{
  "type": "telemetry",
  "droneIP": "192.168.4.2",
  "data": {"x": 1.5, "y": 2.3, "z": 2.1, ...}
}
```

#### 2. Serial (Bridge Server ↔ ESP32 AP)

**Commands to ESP32 AP:**
```json
{"cmd": "discover"}
{"cmd": "send", "ip": "192.168.4.2", "data": {...}}
{"cmd": "list"}
```

**Responses from ESP32 AP:**
```json
{"type": "drone_list", "drones": [...]}
{"type": "telemetry", "ip": "192.168.4.2", "data": {...}}
{"type": "drone_connected", "ip": "192.168.4.2"}
```

#### 3. WiFi UDP (ESP32 AP ↔ Drones)

**Commands to drones (port 8888):**
```json
{"cmd": "mission", "data": [{"t":0, "x":0, "y":0, "z":2, ...}, ...]}
{"cmd": "start"}
{"cmd": "stop"}
{"cmd": "emergency"}
```

**Telemetry from drones (port 8889, 10Hz):**
```json
{
  "x": 1.5, "y": 2.3, "z": 2.1,
  "yaw": 45.0, "pitch": 5.2, "roll": -2.1,
  "tx": 3.0, "ty": 3.0, "tz": 3.0
}
```

## Tech Stack

- **React** 18.2.0 - UI framework
- **Three.js** 0.158.0 - 3D graphics
- **Lucide React** - Icon library
- **Tailwind CSS** - Styling
- **Node.js + WebSocket (ws)** - Bridge server
- **UDP** - Drone communication protocol

## Hardware Requirements

- **ESP32 Mini** with built-in OLED display (128x64)
- **MPU6050** Gyro/Accelerometer
- **BLE 5.1** module for AoA positioning
- **10 BLE Anchors** for positioning system
- **Betaflight Flight Controller** (SBUS input)

## License

This project is for educational and research purposes.
