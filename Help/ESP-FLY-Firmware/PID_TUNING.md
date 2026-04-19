# PID Tuning Guide - ESP-FLY Firmware

Guide to tuning PID controllers for stable and responsive flight.

---

## 📋 Overview

The ESP-FLY firmware uses a **3-level control architecture**:

1. **Position Control** (50Hz) - Position error → Velocity command
2. **Velocity to Attitude** - Velocity → Roll/Pitch angles
3. **Attitude Control** (500Hz) - Angle error → Motor commands

Each level has separate PID controllers that must be tuned in order.

---

## 🎯 Default PID Values

### Position PIDs

| Axis | Kp | Ki | Kd | Function |
|------|----|----|-----|----------|
| X | 1.0 | 0.01 | 0.5 | East-West position |
| Y | 1.0 | 0.01 | 0.5 | North-South position |
| Z | 1.5 | 0.02 | 0.6 | Altitude |

### Attitude PIDs

| Axis | Kp | Ki | Kd | Function |
|------|----|----|-----|----------|
| Roll | 3.5 | 0.0 | 0.0 | Bank left/right |
| Pitch | 3.5 | 0.0 | 0.0 | Nose up/down |
| Yaw | 2.5 | 0.0 | 0.0 | Rotation |

**Note:** Attitude PIDs are currently P-only (Ki=0, Kd=0) for simplicity. This works well for most quadcopters.

---

## 🔧 Tuning Procedure

### Safety First!

⚠️ **IMPORTANT SAFETY RULES:**

1. **Remove propellers** during initial tuning
2. Use a **tether** or **safety net** during flight tests
3. Have **emergency stop** command ready
4. Start with **low gains** and increase gradually
5. Test in **open area** away from people and objects
6. Keep a **fire extinguisher** nearby (LiPo safety)

### Tuning Order

**Step 1:** Attitude Control (stabilization)
**Step 2:** Position Control (waypoint following)

Never skip Step 1! Position control cannot work without stable attitude control.

---

## 🎮 Step 1: Attitude Control Tuning

### Goal

Drone should hover stably when given constant roll/pitch/yaw commands.

### Method: Ziegler-Nichols (Simplified)

#### 1.1: Find Critical Gain (Kp only)

**Setup:**
- Props OFF for initial testing
- Motors should spin up when tilted

**Process:**

1. Start with low Kp (1.0):
   ```bash
   python3 tools/test_commands.py --ip 192.168.4.2 \
       --pid axis=roll kp=1.0 ki=0.0 kd=0.0
   ```

2. Gradually increase Kp until oscillations appear
3. Note the Kp value where oscillations start = Kp_critical

**Expected Results:**

| Kp Value | Behavior |
|----------|----------|
| 1.0 | Slow response, under-damped |
| 2.0 | Better response |
| 3.5 | Good response (default) |
| 5.0 | Fast response, slight oscillations |
| 7.0 | Continuous oscillations = Kp_critical |

#### 1.2: Calculate Final Gains

**For P-only control** (recommended for attitude):
```
Kp = 0.5 * Kp_critical
Ki = 0
Kd = 0
```

**For PID control** (more advanced):
```
Kp = 0.6 * Kp_critical
Ki = 2 * Kp / T_u
Kd = Kp * T_u / 8
```

Where `T_u` = oscillation period at Kp_critical

#### 1.3: Apply Same Values to Pitch

Roll and pitch should have identical gains (symmetrical quadcopter).

#### 1.4: Tune Yaw Separately

Yaw response is typically slower:
```
Kp_yaw = 0.7 * Kp_roll
```

### Flight Test (Attitude Only)

**With props ON, tethered:**

1. Arm drone:
   ```bash
   python3 tools/test_commands.py --arm
   ```

2. Manually increase throttle (not implemented yet - use manual control)

3. Observe behavior:
   - **Under-damped:** Drone drifts, slow to recover → Increase Kp
   - **Over-damped:** Drone oscillates, buzzing sound → Decrease Kp
   - **Just right:** Drone hovers smoothly, quick recovery from disturbances

### Attitude Tuning Examples

**Scenario 1: Drone drifts slowly**
```bash
# Increase Kp by 20%
python3 tools/test_commands.py --pid axis=roll kp=4.2
python3 tools/test_commands.py --pid axis=pitch kp=4.2
```

**Scenario 2: Drone oscillates rapidly**
```bash
# Decrease Kp by 30%
python3 tools/test_commands.py --pid axis=roll kp=2.45
python3 tools/test_commands.py --pid axis=pitch kp=2.45
```

**Scenario 3: Drone recovers but drifts over time (attitude hold)**
```bash
# Add small integral term
python3 tools/test_commands.py --pid axis=roll kp=3.5 ki=0.1 kd=0.0
```

---

## 🗺️ Step 2: Position Control Tuning

### Goal

Drone should fly to waypoints smoothly without overshooting.

### Prerequisites

- Attitude control must be tuned first
- BLE positioning must be working (accuracy < 0.5m)
- Drone can hover stably

### Method: Manual Tuning

#### 2.1: Test with Simple Mission

Upload 2-point mission (0,0,1) → (2,0,1):

```bash
python3 tools/test_commands.py --simple
```

Observe behavior:
- **Slow approach:** Kp too low
- **Overshoots target:** Kp too high, need Kd
- **Oscillates around target:** Kp too high
- **Steady-state error:** Need Ki (small amount)

#### 2.2: Tune X and Y Separately

**Start with default:** Kp=1.0, Ki=0.01, Kd=0.5

**Tune X axis first:**

```bash
# Test flight East (X direction)
python3 tools/test_commands.py --mission '{
  "cmd": "mission",
  "data": [
    {"t": 0, "x": 0, "y": 0, "z": 1, "yaw": 0, "pitch": 0, "roll": 0},
    {"t": 5, "x": 3, "y": 0, "z": 1, "yaw": 0, "pitch": 0, "roll": 0}
  ]
}'

python3 tools/test_commands.py --start
```

Watch telemetry:
```bash
python3 tools/test_commands.py --monitor 10
```

Adjust based on response:

**Too slow (reaches 3m after 8+ seconds):**
```bash
python3 tools/test_commands.py --pid axis=x kp=1.5
```

**Overshoots (goes past 3m):**
```bash
python3 tools/test_commands.py --pid axis=x kp=0.8 kd=0.8
```

**Oscillates (bounces around 3m):**
```bash
python3 tools/test_commands.py --pid axis=x kp=0.7 kd=0.3
```

**Steady error (stops at 2.8m):**
```bash
python3 tools/test_commands.py --pid axis=x kp=1.0 ki=0.05
```

#### 2.3: Apply Same Gains to Y

After X is tuned, copy gains to Y:

```bash
python3 tools/test_commands.py --pid axis=y kp=1.5 ki=0.05 kd=0.8
```

Test North (Y direction):
```bash
python3 tools/test_commands.py --mission '{
  "cmd": "mission",
  "data": [
    {"t": 0, "x": 0, "y": 0, "z": 1, "yaw": 0, "pitch": 0, "roll": 0},
    {"t": 5, "x": 0, "y": 3, "z": 1, "yaw": 0, "pitch": 0, "roll": 0}
  ]
}'
```

#### 2.4: Tune Z (Altitude) Separately

Altitude control is more aggressive (higher Kp):

**Test altitude change:**
```bash
python3 tools/test_commands.py --mission '{
  "cmd": "mission",
  "data": [
    {"t": 0, "x": 0, "y": 0, "z": 0.5, "yaw": 0, "pitch": 0, "roll": 0},
    {"t": 3, "x": 0, "y": 0, "z": 2.0, "yaw": 0, "pitch": 0, "roll": 0}
  ]
}'
```

Altitude response should be:
- **Fast** (reaches target in ~2s)
- **No overshoot** (doesn't bounce)
- **Smooth** (gradual acceleration)

Typical Z gains: Kp=1.5-2.5, Ki=0.02, Kd=0.6-1.0

### Position Tuning Rules of Thumb

**Kp (Proportional):**
- Primary gain - affects response speed
- Too low → sluggish
- Too high → overshoot, oscillation
- Start at 1.0, adjust ±50%

**Ki (Integral):**
- Eliminates steady-state error
- Should be small (0.01-0.1)
- Too high → oscillation, overshoot
- Start at 0.01

**Kd (Derivative):**
- Dampens oscillations
- Improves stability
- Too high → jerky movements
- Start at 0.5

---

## 📊 Analyzing Flight Logs

### Real-time Telemetry

Monitor during flight:

```bash
python3 tools/test_commands.py --monitor 30
```

Look for:
- **Position error:** Target - Current position
- **Convergence time:** How long to reach target
- **Overshoot:** Max position beyond target
- **Oscillations:** Frequency and amplitude

### Good vs Bad Responses

**Good Response (well-tuned):**
```
[0.0s] Pos:(0.00, 0.00, 1.00) Target:(3.00, 0.00, 1.00)
[1.0s] Pos:(1.20, 0.05, 1.00) Target:(3.00, 0.00, 1.00)
[2.0s] Pos:(2.40, -0.02, 1.00) Target:(3.00, 0.00, 1.00)
[3.0s] Pos:(2.95, 0.01, 1.00) Target:(3.00, 0.00, 1.00)
[4.0s] Pos:(3.00, 0.00, 1.00) Target:(3.00, 0.00, 1.00)
```
✅ Smooth approach, reaches target in ~3s, no overshoot

**Bad Response (under-tuned Kp):**
```
[0.0s] Pos:(0.00, 0.00, 1.00) Target:(3.00, 0.00, 1.00)
[1.0s] Pos:(0.50, 0.00, 1.00) Target:(3.00, 0.00, 1.00)
[2.0s] Pos:(1.00, 0.00, 1.00) Target:(3.00, 0.00, 1.00)
[5.0s] Pos:(2.20, 0.00, 1.00) Target:(3.00, 0.00, 1.00)
[8.0s] Pos:(2.85, 0.00, 1.00) Target:(3.00, 0.00, 1.00)
```
❌ Too slow, never quite reaches target

**Bad Response (over-tuned Kp):**
```
[0.0s] Pos:(0.00, 0.00, 1.00) Target:(3.00, 0.00, 1.00)
[1.0s] Pos:(2.50, 0.00, 1.00) Target:(3.00, 0.00, 1.00)
[2.0s] Pos:(3.80, 0.00, 1.00) Target:(3.00, 0.00, 1.00)
[3.0s] Pos:(2.70, 0.00, 1.00) Target:(3.00, 0.00, 1.00)
[4.0s] Pos:(3.20, 0.00, 1.00) Target:(3.00, 0.00, 1.00)
```
❌ Oscillates around target, overshoots

---

## 🎯 Advanced Tuning

### Adaptive Gains

Modify `position_controller.c` to adjust gains based on conditions:

```c
// Example: Reduce gains at high speed for stability
float speed = sqrtf(vx*vx + vy*vy);
if (speed > 2.0f) {
    kp *= 0.7;  // Reduce by 30% at high speed
}
```

### Gain Scheduling

Different gains for different flight phases:

```c
if (altitude < 0.5f) {
    // Landing - more aggressive altitude control
    pid_z.kp = 2.5f;
} else {
    // Normal flight
    pid_z.kp = 1.5f;
}
```

### Nonlinear Control

Implement nonlinear PID for better performance:

```c
// Square-root control for smoother approach
float error_shaped = copysignf(sqrtf(fabsf(error)), error);
p_term = kp * error_shaped;
```

---

## 🐛 Common Tuning Problems

### Problem: Drone Won't Take Off

**Symptoms:**
- Motors spin but drone doesn't lift
- Throttle reaches 100% immediately

**Solutions:**
1. Increase base throttle in `position_controller.c`:
   ```c
   const float base_throttle = 50.0f;  // Try 60-70
   ```
2. Check battery voltage (should be > 3.7V)
3. Check propeller direction
4. Check motor connections

### Problem: Altitude Hunting

**Symptoms:**
- Altitude constantly bounces up and down
- ±0.2m oscillation

**Solutions:**
1. Reduce Z-axis Kp:
   ```bash
   python3 tools/test_commands.py --pid axis=z kp=1.0
   ```
2. Increase Z-axis Kd:
   ```bash
   python3 tools/test_commands.py --pid axis=z kp=1.5 kd=1.0
   ```

### Problem: Position Drift

**Symptoms:**
- Drone slowly drifts away from target
- Never quite reaches waypoint

**Solutions:**
1. Increase Ki slightly:
   ```bash
   python3 tools/test_commands.py --pid axis=x ki=0.05
   python3 tools/test_commands.py --pid axis=y ki=0.05
   ```
2. Check BLE positioning accuracy
3. Calibrate IMU (keep level during boot)

### Problem: Jerky Movements

**Symptoms:**
- Abrupt changes in velocity
- "Stuttering" motion

**Solutions:**
1. Lower position control frequency (50Hz → 30Hz)
2. Increase Kd for damping
3. Use smooth interpolation mode

---

## 💾 Saving Tuned Values

### Method 1: Edit config.h

After finding good values, update `main/config.h`:

```c
#define PID_POS_X_KP 1.5f   // Your tuned value
#define PID_POS_X_KI 0.05f
#define PID_POS_X_KD 0.8f
```

Rebuild and reflash.

### Method 2: NVS Storage (Future)

Implement PID storage in non-volatile memory:

```c
// Save PID values to NVS
nvs_set_float(handle, "pid_x_kp", 1.5f);

// Load on boot
nvs_get_float(handle, "pid_x_kp", &pid_x.kp);
```

---

## 📖 PID Theory Quick Reference

### What Each Term Does

**P (Proportional):**
- Output proportional to error
- Fast response, but can overshoot
- "Push harder when far from target"

**I (Integral):**
- Accumulates error over time
- Eliminates steady-state error
- "If we keep missing, push harder"
- WARNING: Can cause overshoot/oscillation if too large

**D (Derivative):**
- Predicts future error based on rate of change
- Dampens oscillations
- "If approaching fast, start slowing down"
- Acts like friction

### Mathematical Definition

```
output = Kp * error + Ki * ∫error dt + Kd * d(error)/dt
```

### Tuning Effects

| Change | Speed | Overshoot | Stability | Steady Error |
|--------|-------|-----------|-----------|--------------|
| ↑ Kp | Faster | More | Less | Same |
| ↑ Ki | Slower | More | Less | Less |
| ↑ Kd | Same | Less | More | Same |

---

## ✅ Tuning Complete Checklist

- [ ] Attitude PIDs tuned (roll, pitch, yaw)
- [ ] Drone hovers stably (no oscillations)
- [ ] Position PIDs tuned (x, y, z)
- [ ] Drone reaches waypoints smoothly
- [ ] No overshoot (< 0.3m)
- [ ] Response time acceptable (< 5s for 3m)
- [ ] Tested square pattern successfully
- [ ] Tested circle pattern successfully
- [ ] Values saved to config.h
- [ ] Firmware rebuilt and reflashed

---

**Good PID values = Smooth and stable flight! 🚁**
