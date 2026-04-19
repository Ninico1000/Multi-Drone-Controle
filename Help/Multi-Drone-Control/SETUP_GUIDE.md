# Multi-Drone Control System - Complete Setup Guide

## System Overview

This system uses an **ESP32 Access Point** connected to your PC via USB to create a dedicated WiFi network for drone control. Drones connect to this Access Point and are automatically discovered.

```
PC/Laptop
  ↓ USB
ESP32 Access Point (WiFi hotspot)
  ↓ WiFi (192.168.4.x network)
ESP32 Drones (3x)
```

## Hardware Requirements

### 1. ESP32 Access Point (1x)
- **Any ESP32 board** (ESP32-DevKit, ESP32-WROOM, etc.)
- **Connection**: USB cable to PC
- **Purpose**: Creates WiFi network for drones, bridges Serial ↔ WiFi

### 2. ESP32 Drones (3x)
- **ESP32 Mini** with built-in OLED display (128x64)
- **MPU6050** Gyro/Accelerometer (I2C)
- **BLE 5.1** module for AoA positioning
- **Connection**: WiFi to Access Point
- **SBUS output** to Betaflight flight controller

### 3. BLE Positioning System
- **10 BLE Anchors** for AoA positioning (0.1-0.3m accuracy)
- 25m x 25m coverage area

## Software Installation

### Step 1: Flash ESP32 Access Point

1. Open `AccessPoint_ESP32.ino` in Arduino IDE
2. Install required library:
   ```
   ArduinoJson (v6.21 or later)
   ```
3. Select your ESP32 board in Arduino IDE
4. Upload the sketch to your ESP32
5. The ESP32 will create a WiFi network:
   - **SSID**: `DroneControl-AP`
   - **Password**: `drone12345`
   - **AP IP**: `192.168.4.1`

### Step 2: Flash ESP32 Drones

1. Open `DroneControl.txt` in Arduino IDE (rename to `.ino`)
2. Install required libraries:
   ```
   Adafruit GFX Library
   Adafruit SSD1306
   MPU6050
   ```
3. **Configure WiFi** in the drone code:
   ```cpp
   const char* ssid = "DroneControl-AP";      // Match Access Point
   const char* password = "drone12345";
   ```
4. Upload to each drone
5. Each drone will auto-connect and get an IP:
   - Drone 1: `192.168.4.2`
   - Drone 2: `192.168.4.3`
   - Drone 3: `192.168.4.4`
   - (assigned by DHCP)

### Step 3: Install Node.js Bridge Server

```bash
cd server
npm install
```

This installs:
- `ws` (WebSocket server)
- `serialport` (USB/Serial communication)
- `@serialport/parser-readline` (Line parsing)

### Step 4: Install React Web App

```bash
npm install
```

## Running the System

### Terminal 1: Bridge Server

```bash
cd server
npm start
```

**What happens:**
1. Server scans all COM ports
2. Auto-detects ESP32 Access Point
3. Connects via Serial (115200 baud)
4. Waits for drones to connect

**Expected output:**
```
=============================================================
ESP32 Access Point Bridge Server
=============================================================
Searching for ESP32 Access Point...

Available COM ports:
  /dev/ttyUSB0: Silicon Labs

Attempting to connect to /dev/ttyUSB0...
✓ Connected to ESP32 Access Point on /dev/ttyUSB0
  Access Point initialized

WebSocket server running on port 3001
```

### Terminal 2: React Web App

```bash
npm start
```

Opens at [http://localhost:3000](http://localhost:3000)

## Using the System

### 1. Power On Sequence

1. **Connect ESP32 AP** to PC via USB
2. **Start bridge server** (Terminal 1)
3. Wait for "ESP32 Access Point connected"
4. **Power on drones** - they auto-connect to WiFi
5. **Start React app** (Terminal 2)

### 2. Discover Drones

In the web app:
1. Check **"Bridge OK"** indicator (green)
2. Click **"Drohnen suchen"** button
3. Discovered drones appear automatically
4. Position updates in real-time via telemetry

### 3. Create & Upload Mission

1. Click **"+ KF"** to add keyframes
2. Edit position (X, Y, Z) and time
3. Click **"Upload"** - sends mission to drone via WiFi
4. Click **"Start"** - drone begins autonomous flight
5. **E-Stop** for emergency landing

### 4. Monitor Flight

- **3D Viewport**: Shows drone paths and positions
- **Timeline**: Visual representation of keyframes
- **Event Log**: System messages and errors
- **Drone Panel**: Real-time position and status

## Troubleshooting

### Bridge Server Issues

**Problem**: "No ESP32 Access Point found"
- Check USB cable connection
- Verify ESP32 is powered on
- Try different USB port
- Check if correct firmware is flashed

**Problem**: "Timeout waiting for ESP32 ready signal"
- Re-flash Access Point firmware
- Check Serial Monitor for errors (115200 baud)
- Verify ArduinoJson library is installed

### Drone Connection Issues

**Problem**: Drones not discovered
- Verify drones are powered on
- Check WiFi credentials match Access Point
- Press "Drohnen suchen" button manually
- Check drone Serial Monitor for WiFi errors

**Problem**: "Bridge Server nicht verbunden"
- Start bridge server first
- Check if port 3001 is available
- Restart React app

### Communication Issues

**Problem**: Mission upload fails
- Verify drone IP address is correct
- Check "Bridge OK" indicator is green
- Ensure drone is connected (green WiFi icon)
- Check Event Log for error messages

**Problem**: No telemetry received
- Verify drone firmware sends telemetry (port 8889)
- Check drone's WiFi connection
- Restart drone

## Network Configuration

### Access Point Network

```
Network: 192.168.4.0/24
Gateway: 192.168.4.1 (ESP32 AP)
DHCP Range: 192.168.4.2 - 192.168.4.254
```

### Ports

- **UDP 8888**: Commands to drones
- **UDP 8889**: Telemetry from drones
- **UDP 8890**: Discovery protocol
- **WebSocket 3001**: React ↔ Bridge Server

## LED Indicators (ESP32 AP)

The built-in LED shows connection status:
- **Slow blink**: Access Point active, no drones
- **Fast blink**: Drones connected
- **Solid**: Serial communication active

## Safety Features

1. **Emergency Stop**: Immediately lands all drones
2. **Connection Timeout**: Drones auto-land if WiFi lost (10s)
3. **Battery Monitoring**: Low battery warnings
4. **Collision Avoidance**: Check paths in 3D view before upload

## Advanced Configuration

### Change WiFi Credentials

**Access Point** (`AccessPoint_ESP32.ino`):
```cpp
const char* ap_ssid = "YourNetworkName";
const char* ap_password = "YourPassword";
```

**Drones** (`DroneControl.txt`):
```cpp
const char* ssid = "YourNetworkName";
const char* password = "YourPassword";
```

### Adjust UDP Ports

Modify in both Access Point and Bridge Server:
- `DRONE_UDP_PORT` (8888)
- `AP_UDP_PORT` (8889)
- `DISCOVERY_PORT` (8890)

### COM Port Detection

Bridge server auto-detects ESP32 by manufacturer:
- Silicon Labs (CP210x)
- FTDI
- CH340
- USB/ACM devices

To manually specify a port, edit `serial-bridge.js`:
```javascript
await connectToPort('/dev/ttyUSB0'); // Linux
await connectToPort('COM3');          // Windows
```

## Updating Firmware

### Access Point OTA Update
Connect via Serial Monitor and send JSON command:
```json
{"cmd":"ota","url":"http://yourserver.com/firmware.bin"}
```

### Drone OTA Update
Upload mission with special OTA command:
```json
{"cmd":"ota","url":"http://yourserver.com/drone_firmware.bin"}
```

## Performance Tips

1. **Reduce Telemetry Rate**: Change from 10Hz to 5Hz if lagging
2. **Limit Keyframes**: Keep under 50 keyframes per drone
3. **Close Unused Apps**: Free up WebSocket resources
4. **Use USB 3.0**: Faster Serial communication

## Support

For issues, check:
1. Serial Monitor output (both AP and drones)
2. Browser Console (F12) for JavaScript errors
3. Event Log in the web app
4. Bridge server console output

## License

Educational and research use only.
