# Build Instructions - ESP-FLY Firmware

Complete guide to building and flashing the ESP-FLY firmware.

---

## Prerequisites

### 1. Install ESP-IDF

**Linux/Mac:**

```bash
# Install dependencies
sudo apt-get install git wget flex bison gperf python3 python3-pip \
    python3-venv cmake ninja-build ccache libffi-dev libssl-dev \
    dfu-util libusb-1.0-0

# Clone ESP-IDF
mkdir -p ~/esp
cd ~/esp
git clone --recursive https://github.com/espressif/esp-idf.git
cd esp-idf
git checkout v5.0  # Or latest stable version

# Install ESP-IDF tools
./install.sh esp32s3

# Source ESP-IDF environment (add to ~/.bashrc for persistence)
. ~/esp/esp-idf/export.sh
```

**Windows:**

1. Download and run the ESP-IDF Windows Installer
2. Follow the installation wizard
3. Launch "ESP-IDF Command Prompt" from Start Menu

**Verify Installation:**

```bash
idf.py --version
# Should show: ESP-IDF v5.0 or later
```

### 2. Install USB Serial Driver

**XIAO ESP32S3** uses **CH340** USB-to-Serial chip.

**Linux:**
- Usually built into kernel (no action needed)
- Verify: `ls /dev/ttyUSB*` or `ls /dev/ttyACM*`

**Mac:**
- Install driver from: https://www.wch-ic.com/downloads/CH34XSER_MAC_ZIP.html

**Windows:**
- Install driver from: https://www.wch-ic.com/downloads/CH341SER_ZIP.html

**Grant Permissions (Linux):**

```bash
sudo usermod -a -G dialout $USER
# Logout and login for changes to take effect
```

---

## Building the Firmware

### 1. Clone Repository

```bash
cd ~/your-project-directory
# The firmware should already be in ESP-FLY-Firmware folder
cd ESP-FLY-Firmware
```

### 2. Configure Drone ID

Edit `main/config.h`:

```c
#define DRONE_ID 1  // Change for each drone: 1, 2, 3, etc.
```

This sets the static IP:
- Drone 1 → 192.168.4.2
- Drone 2 → 192.168.4.3
- Drone 3 → 192.168.4.4

### 3. Set Target

```bash
idf.py set-target esp32s3
```

Expected output:
```
Setting target to 'esp32s3'
...
Successfully set target esp32s3
```

### 4. Configure Project (Optional)

```bash
idf.py menuconfig
```

Navigate with arrow keys, Enter to select, ESC to go back.

**Key Settings:**
- `Component config → ESP32S3-Specific` - Verify CPU freq (240MHz)
- `Component config → Wi-Fi` - Adjust buffer sizes if needed
- `Component config → FreeRTOS` - Task watchdog settings
- `Partition Table` - Use custom partitions.csv (already configured)

Press 'S' to save, 'Q' to quit.

### 5. Build

**Full build:**
```bash
idf.py build
```

**Clean build (if errors occur):**
```bash
idf.py fullclean
idf.py build
```

**Build Output:**

Expected time: 2-5 minutes (first build), 10-30 seconds (incremental)

Success message:
```
Project build complete. To flash, run this command:
idf.py -p (PORT) flash
```

**Build Artifacts:**

```
build/
├── esp-fly-firmware.bin    # Main firmware
├── bootloader/
│   └── bootloader.bin      # ESP32 bootloader
├── partition_table/
│   └── partition-table.bin # Partition layout
└── elf/
    └── esp-fly-firmware.elf # Debug symbols
```

---

## Flashing the Firmware

### 1. Connect Hardware

1. Connect XIAO ESP32S3 to PC via USB-C cable
2. Press and hold BOOT button on XIAO (if not auto-detecting)
3. Verify port appears:

**Linux/Mac:**
```bash
ls /dev/ttyUSB* # or /dev/ttyACM*
# Should show: /dev/ttyUSB0 (or similar)
```

**Windows:**
```
Device Manager → Ports (COM & LPT)
# Should show: USB-SERIAL CH340 (COM3) or similar
```

### 2. Flash

**Auto-detect port:**
```bash
idf.py flash
```

**Specify port:**
```bash
idf.py -p /dev/ttyUSB0 flash  # Linux/Mac
idf.py -p COM3 flash          # Windows
```

**Flash with monitor:**
```bash
idf.py -p /dev/ttyUSB0 flash monitor
```

### 3. Flash Options

**Erase flash before flashing:**
```bash
idf.py -p /dev/ttyUSB0 erase-flash
idf.py -p /dev/ttyUSB0 flash
```

**Flash only app (faster, for code changes):**
```bash
idf.py -p /dev/ttyUSB0 app-flash
```

**Flash bootloader and partitions (rarely needed):**
```bash
idf.py -p /dev/ttyUSB0 bootloader-flash
idf.py -p /dev/ttyUSB0 partition-table-flash
```

### 4. Flash Speed

Modify baud rate for faster flashing:

```bash
idf.py -p /dev/ttyUSB0 -b 921600 flash
```

Default: 460800 (stable)
Fast: 921600 (may fail on some systems)

---

## Monitoring Serial Output

### Using idf.py

```bash
idf.py -p /dev/ttyUSB0 monitor
```

**Keyboard shortcuts:**
- `Ctrl+]` - Exit monitor
- `Ctrl+T` then `Ctrl+R` - Reset ESP32
- `Ctrl+T` then `Ctrl+H` - Show help

**Color-coded logs:**
- <span style="color:red">**E**</span> - Error (red)
- <span style="color:yellow">**W**</span> - Warning (yellow)
- <span style="color:green">**I**</span> - Info (green)
- <span style="color:cyan">**D**</span> - Debug (cyan)
- <span style="color:gray">**V**</span> - Verbose (gray)

### Using screen (Linux/Mac)

```bash
screen /dev/ttyUSB0 115200
# Ctrl+A then K to exit
```

### Using minicom (Linux)

```bash
minicom -D /dev/ttyUSB0 -b 115200
```

### Using PuTTY (Windows)

1. Open PuTTY
2. Connection type: Serial
3. Serial line: COM3 (your port)
4. Speed: 115200
5. Click "Open"

---

## Verifying Successful Boot

### Expected Serial Output

```
ESP-ROM:esp32s3-20210327
Build:Mar 27 2021
rst:0x1 (POWERON),boot:0x8 (SPI_FAST_FLASH_BOOT)
...

========================================
   ESP-FLY Firmware v1.0
   Multi-Drone Mission Control
========================================

Hardware: XIAO ESP32S3 + ESP-FLY
Drone ID: 1

[MAIN] Initializing hardware...
[MAIN] Status LED initialized on GPIO21
[MAIN] Motor PWM initialized (4 channels @ 16000Hz)
[MAIN] Battery ADC initialized on GPIO2

[MAIN] Initializing software modules...
[TELEMETRY] Telemetry module initialized
[SAFETY] Safety module initialized
[BLE_POS] BLE positioning initialized
[POS_CTRL] Position controller initialized
[POS_CTRL] X PID: Kp=1.00 Ki=0.010 Kd=0.50
[POS_CTRL] Y PID: Kp=1.00 Ki=0.010 Kd=0.50
[POS_CTRL] Z PID: Kp=1.50 Ki=0.020 Kd=0.60
[MISSION] Mission control initialized
[UDP] UDP handler initialized

[MAIN] Connecting to WiFi...
[WIFI] WiFi manager initialized
[WIFI] Static IP configured: 192.168.4.2
[WIFI] Connecting to SSID:DroneControl-AP...
[WIFI] Connected to AP successfully
[WIFI] Got IP address: 192.168.4.2

[MAIN] WiFi connected: 192.168.4.2
[MAIN] RSSI: -45 dBm

[MAIN] Starting RTOS tasks...
[POS_CTRL] Position control task started
[MISSION] Mission control task started
[UDP] Socket created
[UDP] Socket bound, listening on port 8888
[UDP] Telemetry broadcaster started

========================================
   System Ready!
   Waiting for commands on UDP:8888
   Broadcasting telemetry on UDP:8889
========================================
```

### Success Indicators

✅ All modules initialize without errors
✅ WiFi connects successfully
✅ IP address assigned (192.168.4.x)
✅ UDP sockets created
✅ All RTOS tasks started
✅ "System Ready!" message appears

### Common Boot Issues

**WiFi connection fails:**
- Check SSID and password in config.h
- Ensure Access Point is powered on
- Verify WiFi range

**No serial output:**
- Wrong baud rate (should be 115200)
- Wrong COM port
- USB cable issue (try different cable)
- Press RESET button on XIAO

**Watchdog timeout:**
- Increase watchdog timeout in sdkconfig
- Check for blocking code in tasks

---

## Updating Drone ID for Multiple Drones

### Method 1: Edit and Rebuild

For each drone:

1. Edit `main/config.h`:
   ```c
   #define DRONE_ID 2  // Change to 2, 3, 4, etc.
   ```

2. Rebuild:
   ```bash
   idf.py build
   ```

3. Flash to drone:
   ```bash
   idf.py -p /dev/ttyUSB0 flash
   ```

4. Verify IP in serial monitor:
   ```
   [WIFI] Got IP address: 192.168.4.3  // Drone 2
   ```

### Method 2: Multiple Build Configs (Advanced)

Create separate build directories:

```bash
# Build for Drone 1
idf.py -D DRONE_ID=1 -B build_drone1 build
idf.py -B build_drone1 -p /dev/ttyUSB0 flash

# Build for Drone 2
idf.py -D DRONE_ID=2 -B build_drone2 build
idf.py -B build_drone2 -p /dev/ttyUSB0 flash
```

---

## Backup and Restore

### Backup Current Firmware

```bash
esptool.py -p /dev/ttyUSB0 read_flash 0 0x400000 backup.bin
```

### Restore Firmware

```bash
esptool.py -p /dev/ttyUSB0 write_flash 0x0 backup.bin
```

---

## OTA Updates (Future)

The firmware includes OTA partition support for wireless updates.

**To implement OTA:**

1. Create OTA server on PC
2. Add OTA update command to UDP protocol
3. Drone downloads and flashes new firmware
4. Automatically reboots with new version

See ESP-IDF OTA examples: `$IDF_PATH/examples/system/ota/`

---

## Troubleshooting Build Issues

### Python Dependencies Missing

```bash
pip install -r $IDF_PATH/requirements.txt
```

### CMake Not Found

**Linux:**
```bash
sudo apt-get install cmake
```

**Mac:**
```bash
brew install cmake
```

### Ninja Not Found

```bash
pip install ninja
```

### Out of Memory During Build

Reduce parallel jobs:

```bash
idf.py build -j1  # Use 1 core instead of all
```

### Permission Denied on Serial Port

**Linux:**
```bash
sudo chmod 666 /dev/ttyUSB0
# Or permanently:
sudo usermod -a -G dialout $USER
# Then logout and login
```

---

## Build Performance Tips

### Faster Builds

1. **Use ccache:**
   ```bash
   export IDF_CCACHE_ENABLE=1
   idf.py build
   ```

2. **Parallel jobs:**
   ```bash
   idf.py build -j8  # Use 8 cores
   ```

3. **Component-specific build:**
   ```bash
   idf.py build main  # Only rebuild main component
   ```

### Reduce Build Size

In `sdkconfig`:
- Enable compiler optimization for size
- Disable verbose logging
- Remove unused components

---

## Next Steps

After successful build and flash:

1. **Test Commands** - Use `tools/test_commands.py`
2. **Verify Telemetry** - Monitor UDP port 8889
3. **PID Tuning** - See PID_TUNING.md
4. **First Flight** - See SAFETY.md

---

**Build completed successfully? Continue to Testing!** 🚀
