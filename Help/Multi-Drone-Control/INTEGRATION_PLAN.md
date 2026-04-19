# ESP-Drone Mission Control Integration Plan

## Overview

This document outlines how to integrate the mission planning system with your existing ESP-Drone firmware. The ESP-Drone is based on Bitcraze Crazyflie firmware and already has excellent flight control. We'll **ADD** mission control capabilities **without breaking** existing functionality.

## Current ESP-Drone Architecture

```
ESP-Drone (ESP-IDF based)
├── Stabilizer (500Hz) - Core flight control
├── Commander - Receives setpoints
├── Position Controller - X, Y, Z control
├── Attitude Controller - Roll, Pitch, Yaw
├── WiFi Link - UDP communication (CRTP protocol)
└── Sensors - MPU6050, etc.
```

**What ESP-Drone Already Has:**
- ✅ WiFi communication
- ✅ Position control (X, Y, Z in meters)
- ✅ Attitude control (roll, pitch, yaw)
- ✅ PID controllers
- ✅ Stabilizer at 500Hz
- ✅ Commander pattern
- ✅ Sensor fusion

**What We Need to Add:**
- 📝 Mission keyframe storage
- 📝 Keyframe interpolation
- 📝 Mission execution state machine
- 📝 UDP protocol extension for missions
- 📝 Telemetry output

## Integration Strategy

### Option 1: **Commander Extension** (Recommended)

Add a new mission module that sends setpoints to the existing commander.

```
Mission Module (new)
  ↓ commanderSetSetpoint()
Commander (existing)
  ↓
Position Controller (existing)
  ↓
Stabilizer (existing)
```

**Advantages:**
- ✅ Doesn't modify core flight control
- ✅ Uses proven Crazyflie architecture
- ✅ Easy to debug
- ✅ Can be disabled/enabled
- ✅ Compatible with manual control

### Option 2: High-Level Commander Integration

ESP-Drone may already have `crtp_commander_high_level` which handles trajectories. We can extend this.

### Option 3: Parallel Controller

Create a completely separate control path (NOT recommended - complex and risky).

## Recommended Implementation

### Step 1: Create Mission Module

**File:** `components/core/crazyflie/modules/src/mission_control.c`

```c
// Mission control module for autonomous keyframe execution
#include "mission_control.h"
#include "commander.h"
#include "log.h"
#include "param.h"

#define MAX_KEYFRAMES 100

typedef struct {
    float time;      // seconds
    float x, y, z;   // meters
    float yaw;       // degrees
    float pitch, roll; // degrees (usually 0 for level flight)
} Keyframe;

static Keyframe mission[MAX_KEYFRAMES];
static int numKeyframes = 0;
static bool missionActive = false;
static uint32_t missionStartTime = 0;

// Public functions
void missionControlInit(void);
bool missionControlTest(void);
void missionControlTask(void *param);

// Mission management
void missionClear(void);
void missionAddKeyframe(Keyframe *kf);
void missionStart(void);
void missionStop(void);

// Interpolation
void interpolateKeyframe(float t, setpoint_t *setpoint);
```

### Step 2: Add UDP Command Handler

**File:** `components/core/crazyflie/hal/src/wifilink.c` (modify)

Add mission command handling to existing WiFi protocol:

```c
// In packet handler, add:
case MISSION_UPLOAD:
    // Parse JSON keyframes from UDP
    // Call missionAddKeyframe() for each
    break;

case MISSION_START:
    missionStart();
    break;

case MISSION_STOP:
    missionStop();
    break;

case MISSION_EMERGENCY:
    missionStop();
    commanderSetSetpoint(&emergencySetpoint, COMMANDER_PRIORITY_EXTRX);
    break;
```

### Step 3: FreeRTOS Task for Mission Execution

```c
void missionControlTask(void *param) {
    setpoint_t setpoint;
    TickType_t lastWakeTime = xTaskGetTickCount();

    while (1) {
        if (missionActive) {
            float missionTime = (xTaskGetTickCount() - missionStartTime) / 1000.0f;

            // Interpolate current target position
            interpolateKeyframe(missionTime, &setpoint);

            // Send to commander (high priority for autonomous mode)
            commanderSetSetpoint(&setpoint, COMMANDER_PRIORITY_EXTRX);

            // Send telemetry
            sendMissionTelemetry(missionTime, &setpoint);
        }

        vTaskDelayUntil(&lastWakeTime, M2T(10)); // 100Hz update rate
    }
}
```

### Step 4: Interpolation Function

```c
void interpolateKeyframe(float t, setpoint_t *setpoint) {
    if (numKeyframes < 2) return;

    // Find surrounding keyframes
    int idx = 0;
    for (int i = 0; i < numKeyframes - 1; i++) {
        if (mission[i].time <= t && mission[i+1].time >= t) {
            idx = i;
            break;
        }
    }

    Keyframe *kf1 = &mission[idx];
    Keyframe *kf2 = &mission[idx+1];

    float t1 = kf1->time;
    float t2 = kf2->time;
    float alpha = (t - t1) / (t2 - t1);

    // Smooth interpolation (ease in/out)
    alpha = alpha * alpha * (3.0f - 2.0f * alpha);

    // Interpolate position
    setpoint->position.x = kf1->x + (kf2->x - kf1->x) * alpha;
    setpoint->position.y = kf1->y + (kf2->y - kf1->y) * alpha;
    setpoint->position.z = kf1->z + (kf2->z - kf1->z) * alpha;

    // Interpolate yaw
    setpoint->attitude.yaw = kf1->yaw + (kf2->yaw - kf1->yaw) * alpha;

    // Set control modes
    setpoint->mode.x = modeAbs;
    setpoint->mode.y = modeAbs;
    setpoint->mode.z = modeAbs;
    setpoint->mode.yaw = modeAbs;

    setpoint->velocity_body = false; // World frame
}
```

## Protocol Extension

### Current ESP-Drone Protocol (CRTP)

ESP-Drone uses CRTP (Crazy Realtime Protocol) over UDP. We'll extend it.

### New Mission Commands (JSON over UDP)

```json
// Upload mission
{
  "cmd": "mission_upload",
  "keyframes": [
    {"t": 0, "x": 0, "y": 0, "z": 1.0, "yaw": 0},
    {"t": 5, "x": 2, "y": 2, "z": 1.5, "yaw": 45}
  ]
}

// Start mission
{"cmd": "mission_start"}

// Stop mission
{"cmd": "mission_stop"}

// Emergency stop
{"cmd": "mission_emergency"}
```

### Telemetry Output

```json
{
  "missionTime": 2.5,
  "currentPos": {"x": 1.0, "y": 1.0, "z": 1.25},
  "targetPos": {"x": 1.2, "y": 1.2, "z": 1.3},
  "yaw": 22.5,
  "battery": 3.8,
  "state": "flying"
}
```

## File Changes Required

### New Files to Create

```
components/core/crazyflie/modules/src/mission_control.c
components/core/crazyflie/modules/interface/mission_control.h
```

### Files to Modify

```
components/core/crazyflie/hal/src/wifilink.c          (add mission command parsing)
components/core/crazyflie/modules/src/system.c        (start mission task)
components/config/include/config.h                     (add mission config)
main/CMakeLists.txt                                    (add mission module)
```

## Step-by-Step Integration

### Phase 1: Basic Structure (1-2 hours)
1. Create `mission_control.c` and `.h` files
2. Add to CMakeLists.txt
3. Initialize in `system.c`
4. Test compilation

### Phase 2: Keyframe Storage (1 hour)
1. Implement keyframe array
2. Add functions to add/clear keyframes
3. Test with hardcoded mission

### Phase 3: UDP Protocol (2-3 hours)
1. Add JSON parsing to wifilink.c (use cJSON library)
2. Implement mission upload command
3. Test receiving missions from PC

### Phase 4: Interpolation & Execution (2-3 hours)
1. Implement interpolation function
2. Create mission execution task
3. Send setpoints to commander
4. Test with simple 2-keyframe mission

### Phase 5: Telemetry (1 hour)
1. Add telemetry output function
2. Send via UDP to PC
3. Test visualization in React app

### Phase 6: Testing & Tuning (2-4 hours)
1. Test multi-waypoint missions
2. Tune interpolation
3. Test emergency stop
4. Validate position accuracy

**Total estimated time: 10-15 hours**

## React App Changes

The React app needs minimal changes:

### Update IP Addresses

Change from `192.168.4.x` (Access Point) to ESP-Drone's IP:

```javascript
// In constants/defaults.js
export const INITIAL_DRONES = [
  {
    ...
    ip: '192.168.1.100',  // ESP-Drone IP
    ...
  }
];
```

### Protocol Format

ESP-Drone expects JSON directly (not wrapped):

```javascript
// In droneConnection.js
sendMission(droneIP, keyframes) {
  const payload = {
    cmd: 'mission_upload',
    keyframes: keyframes.map(kf => ({
      t: kf.time,
      x: kf.x,
      y: kf.y,
      z: kf.z,
      yaw: kf.yaw,
      pitch: kf.pitch || 0,
      roll: kf.roll || 0
    }))
  };

  return this.send(droneIP, payload);
}
```

## Safety Considerations

1. **Watchdog Timer**: Commander has 500ms timeout - mission task must send setpoints regularly
2. **Emergency Stop**: Mission task responds to emergency stop immediately
3. **Battery Check**: Stop mission if battery < threshold
4. **Position Limits**: Validate keyframes are within safe area (e.g., ±5m)
5. **Altitude Limits**: Enforce minimum (0.5m) and maximum (3m) height

## Testing Plan

### Ground Tests
1. ✅ Compile and flash firmware
2. ✅ Connect via WiFi
3. ✅ Upload mission (verify storage)
4. ✅ Start mission (verify setpoints)
5. ✅ Check telemetry output

### Bench Tests (Props Off!)
1. ✅ Upload 2-keyframe mission
2. ✅ Start and verify interpolation
3. ✅ Test emergency stop
4. ✅ Test mission completion

### Flight Tests
1. ✅ Hover test (single keyframe at 1m)
2. ✅ Simple path (4 corners of 2m square)
3. ✅ Smooth curve (circle with 8 keyframes)
4. ✅ Emergency stop in flight
5. ✅ Multi-drone formation

## Advantages of This Approach

1. **Non-Invasive**: Doesn't modify core flight control
2. **Proven Architecture**: Uses Crazyflie's commander pattern
3. **Fallback**: Can switch back to manual control anytime
4. **Debuggable**: Mission module can be disabled for testing
5. **Compatible**: Works with existing ESP-Drone tools

## Alternative: Use Your DroneControl.txt

If you prefer a complete rewrite:
- Keep ESP-Drone's sensors and WiFi drivers
- Replace stabilizer/commander with your PID controllers
- Use your mission control directly

**However**, this is **NOT recommended** because:
- ❌ Reinventing proven flight control
- ❌ More testing required
- ❌ Higher crash risk
- ❌ Loses Crazyflie ecosystem compatibility

## Next Steps

1. **Read ESP-Drone documentation**
2. **Test current ESP-Drone functionality**
3. **Backup current working firmware**
4. **Implement Phase 1** (basic structure)
5. **Test incrementally** after each phase

Would you like me to create the actual `mission_control.c` and `mission_control.h` files ready to integrate into ESP-Drone?
