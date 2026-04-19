export const generateArduinoCode = (drone, keyframes) => {
  const kfData = keyframes.map(kf =>
    `  {${kf.time}f, ${kf.x}f, ${kf.y}f, ${kf.z}f, ${kf.yaw}f, ${kf.pitch}f, ${kf.roll}f}`
  ).join(',\n');

  return `// Auto-generated mission for ${drone.name}
// BLE Address: ${drone.bleAddress}

struct Keyframe {
  float time;
  float x, y, z;
  float yaw, pitch, roll;
};

const int numKeyframes = ${keyframes.length};
Keyframe mission[] = {
${kfData}
};

// PID Controller
struct PID {
  float kp = 1.0, ki = 0.1, kd = 0.5;
  float integral = 0, lastError = 0;

  float calculate(float error, float dt) {
    integral += error * dt;
    float derivative = (error - lastError) / dt;
    lastError = error;
    return kp * error + ki * integral + kd * derivative;
  }
};

PID pidX, pidY, pidZ, pidYaw;

// Aktuelle Position (von BLE AoA System)
float currentX = 0, currentY = 0, currentZ = 0;
float currentYaw = 0;

// Interpolation zwischen Keyframes
void interpolateKeyframe(float t, float &x, float &y, float &z, float &yaw, float &pitch, float &roll) {
  int idx = 0;
  for (int i = 0; i < numKeyframes - 1; i++) {
    if (mission[i].time <= t && mission[i+1].time >= t) {
      idx = i;
      break;
    }
  }

  float t1 = mission[idx].time;
  float t2 = mission[idx+1].time;
  float alpha = (t - t1) / (t2 - t1);

  // Smooth interpolation
  alpha = alpha * alpha * (3 - 2 * alpha);

  x = mission[idx].x + (mission[idx+1].x - mission[idx].x) * alpha;
  y = mission[idx].y + (mission[idx+1].y - mission[idx].y) * alpha;
  z = mission[idx].z + (mission[idx+1].z - mission[idx].z) * alpha;
  yaw = mission[idx].yaw + (mission[idx+1].yaw - mission[idx].yaw) * alpha;
  pitch = mission[idx].pitch + (mission[idx+1].pitch - mission[idx].pitch) * alpha;
  roll = mission[idx].roll + (mission[idx+1].roll - mission[idx].roll) * alpha;
}

void setup() {
  Serial.begin(115200);
  // BLE AoA Setup
  setupBLEPositioning();
  // Motor/ESC Setup
  setupMotors();
}

void loop() {
  static unsigned long startTime = millis();
  float missionTime = (millis() - startTime) / 1000.0f;

  // Update Position von BLE AoA System
  updateBLEPosition(&currentX, &currentY, &currentZ, &currentYaw);

  // Ziel-Position aus Mission
  float targetX, targetY, targetZ, targetYaw, targetPitch, targetRoll;
  interpolateKeyframe(missionTime, targetX, targetY, targetZ, targetYaw, targetPitch, targetRoll);

  // PID Kontrolle
  float errorX = targetX - currentX;
  float errorY = targetY - currentY;
  float errorZ = targetZ - currentZ;
  float errorYaw = targetYaw - currentYaw;

  float controlX = pidX.calculate(errorX, 0.01);
  float controlY = pidY.calculate(errorY, 0.01);
  float controlZ = pidZ.calculate(errorZ, 0.01);
  float controlYaw = pidYaw.calculate(errorYaw, 0.01);

  // SBUS Output generieren
  generateSBUS(controlX, controlY, controlZ, controlYaw, targetPitch, targetRoll);

  // Telemetrie senden
  sendTelemetry();

  delay(10); // 100Hz Loop
}`;
};
