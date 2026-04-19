/*
 * ESP Drone v1 — Flight Controller
 * ============================================================
 * MCU   : ESP32-S2-WROVER
 * IMU   : MPU-6050     (I2C bus 0, SDA=IO5, SCL=IO6)
 * Radio : SX1262 LoRa  (SPI HSPI, NSS=IO39, RST=IO21, BUSY=IO38, DIO1=IO37)
 * GPS   : GEPRC M10 FPV (UART1 RX=IO3 ← GPS-TX, TX=IO4 → GPS-RX, 38400 Bd)
 * ESCs  : IO15–IO18    (50 Hz PWM, 1000–2000 µs)
 * LEDs  : 16× WS2812B  (IO26 via 330 Ω)
 * SD    : SPI FSPI     (CMD=IO11, CLK=IO12, DAT0=IO13, CS=IO14)
 *
 * Required libraries (Arduino Library Manager):
 *   RadioLib, MPU6050_light, TinyGPSPlus, Adafruit NeoPixel, ArduinoJson
 *
 * Board: ESP32S2 Dev Module (Espressif esp32 package ≥ 3.x)
 *
 * SD-Card files:
 *   /config.txt   — id=<1–255>  gps_baud=<38400>
 *   /mission.json — exported from Multi-Drone-Control (MissionExport)
 *
 * LoRa protocol — JSON text packets (≤ 200 bytes):
 *   RX commands : {"cmd":"ping"}
 *                 {"cmd":"start"}
 *                 {"cmd":"stop"}
 *                 {"cmd":"emergency"}
 *                 {"cmd":"arm","thr":500,"r":0,"p":0,"y":0,"mode":1}
 *                 {"cmd":"reload"}   — re-read mission.json from SD
 *   TX telemetry: {"id":1,"r":0.1,"p":-0.2,"y":3.1,
 *                  "lat":48.1234,"lng":11.4567,"alt":502.1,
 *                  "arm":1,"mode":2,"wp":12,"bat":0}
 */

#include <Arduino.h>
#include <Wire.h>
#include <SPI.h>
#include <math.h>
#include <Adafruit_NeoPixel.h>
#include <RadioLib.h>
#include <MPU6050_light.h>
#include <TinyGPSPlus.h>
#include <SD.h>
#include <ArduinoJson.h>

// ============================================================
// Pin Definitions  (from KiCad PCB netlist)
// ============================================================

#define PIN_SDA_MPU     5
#define PIN_SCL_MPU     6

#define PIN_GPS_RX      3    // UART1 RX ← GEPRC M10 TX
#define PIN_GPS_TX      4    // UART1 TX → GEPRC M10 RX

#define PIN_ESC1        18   // Motor 1 Front-Left  (CW)
#define PIN_ESC2        17   // Motor 2 Front-Right (CCW)
#define PIN_ESC3        16   // Motor 3 Rear-Right  (CW)
#define PIN_ESC4        15   // Motor 4 Rear-Left   (CCW)

#define PIN_LED         26
#define NUM_LEDS        16

#define PIN_SD_CMD      11
#define PIN_SD_CLK      12
#define PIN_SD_DAT0     13
#define PIN_SD_CS       14

#define PIN_LORA_SCK    34
#define PIN_LORA_MOSI   40
#define PIN_LORA_MISO   41
#define PIN_LORA_NSS    39
#define PIN_LORA_RESET  21
#define PIN_LORA_BUSY   38
#define PIN_LORA_DIO1   37
#define PIN_LORA_DIO2   36
#define PIN_LORA_DIO3   35

// ============================================================
// Configuration
// ============================================================

#define GPS_BAUD_DEFAULT    38400    // GEPRC M10 FPV default

#define LORA_FREQUENCY      868.0f
#define LORA_BANDWIDTH      125.0f
#define LORA_SPREADING      7
#define LORA_CODING_RATE    5
#define LORA_SYNC_WORD      0xAB    // fleet-wide
#define LORA_TX_POWER       14

#define ESC_PWM_FREQ        50
#define ESC_PWM_RES         16
#define ESC_PULSE_MIN       1000
#define ESC_PULSE_MAX       2000
#define ESC_PULSE_ARM       1000

#define LOOP_RATE_HZ        250

// Attitude PID gains
#define PID_ROLL_KP     0.8f
#define PID_ROLL_KI     0.02f
#define PID_ROLL_KD     0.18f
#define PID_PITCH_KP    0.8f
#define PID_PITCH_KI    0.02f
#define PID_PITCH_KD    0.18f
#define PID_YAW_KP      2.0f
#define PID_YAW_KI      0.05f
#define PID_YAW_KD      0.0f

// Position P gains (m → degrees attitude setpoint)
#define POS_P_HORIZ     0.6f   // deg per metre of horizontal error
#define POS_P_VERT      8.0f   // throttle-units per metre of altitude error
#define BASE_HOVER_THR  500    // baseline throttle (0–1000) for hover

#define MAX_WAYPOINTS          400     // fits ~200 s @ 0.5 s intervals
#define GEOFENCE_WARN_M        10.0f   // approach warn inside this margin
#define GEOFENCE_BREACH_MS     90000UL // 1 min 30 s → hard disarm
#define RTH_HOME_RADIUS_M      1.5f    // within this → landed, disarm
#define RTH_DESCENT_RATE       0.3f    // m/s descent near home

// ============================================================
// Waypoint — mirrors MissionExport.jsx output exactly
// ============================================================

struct Waypoint {
    float time;                  // seconds from mission start
    float x, y, z;              // metres  East / North / Up  (local ENU)
    float yaw, pitch, roll;     // degrees
    uint8_t r, g, b;            // LED colour
};

// ============================================================
// PID Controller
// ============================================================

struct PID {
    float kp, ki, kd;
    float integral;
    float last_error;
};

static float pidUpdate(PID &pid, float sp, float meas, float dt) {
    float err        = sp - meas;
    pid.integral    += err * dt;
    pid.integral     = constrain(pid.integral, -200.0f, 200.0f);
    float deriv      = (err - pid.last_error) / dt;
    pid.last_error   = err;
    return pid.kp * err + pid.ki * pid.integral + pid.kd * deriv;
}

static void pidReset(PID &pid) {
    pid.integral   = 0.0f;
    pid.last_error = 0.0f;
}

// ============================================================
// Global Objects
// ============================================================

Adafruit_NeoPixel leds(NUM_LEDS, PIN_LED, NEO_GRB + NEO_KHZ800);

TwoWire         imuWire(0);
MPU6050         mpu(imuWire);

TinyGPSPlus     gps;
HardwareSerial  gpsSerial(1);

SPIClass        loraSPI(HSPI);
SX1262 radio = new Module(PIN_LORA_NSS, PIN_LORA_DIO1,
                           PIN_LORA_RESET, PIN_LORA_BUSY, loraSPI);

PID pid_roll  = { PID_ROLL_KP,  PID_ROLL_KI,  PID_ROLL_KD,  0, 0 };
PID pid_pitch = { PID_PITCH_KP, PID_PITCH_KI, PID_PITCH_KD, 0, 0 };
PID pid_yaw   = { PID_YAW_KP,   PID_YAW_KI,   PID_YAW_KD,   0, 0 };

// ============================================================
// State
// ============================================================

uint8_t  drone_id      = 1;
uint32_t gps_baud      = GPS_BAUD_DEFAULT;

// Flight modes: 0=disarmed 1=stabilize 2=mission 3=return
uint8_t  flight_mode   = 0;
bool     armed         = false;

// Manual setpoints (mode 1)
float    sp_roll = 0, sp_pitch = 0, sp_yaw = 0;
int      sp_throttle = 0;

// IMU
float    imu_roll = 0, imu_pitch = 0, imu_yaw_rate = 0;

// Motor pulse widths
uint16_t m1 = ESC_PULSE_ARM, m2 = ESC_PULSE_ARM,
         m3 = ESC_PULSE_ARM, m4 = ESC_PULSE_ARM;

// LoRa RX flag (set in ISR)
volatile bool lora_rx_flag = false;

// Timing
unsigned long last_loop_us  = 0;
unsigned long last_telem_ms = 0;
unsigned long last_led_ms   = 0;

// ──────────────── Mission state ─────────────────────────────

Waypoint waypoints[MAX_WAYPOINTS];
int      wp_count       = 0;
bool     mission_loaded = false;

// GPS home / emergency / geofence from mission JSON
double   home_lat = 0, home_lng = 0;
double   emg_lat  = 0, emg_lng  = 0;
bool     has_home = false, has_emg = false;
float    geofence_radius = 0;        // 0 = disabled
double   geofence_lat = 0, geofence_lng = 0;

// Mission playback
bool          mission_running  = false;
unsigned long mission_start_ms = 0;

// Geofence / Return-to-Home state
bool          geo_breached      = false;  // currently outside fence
unsigned long geo_breach_ms     = 0;      // millis() when breach started
float         rth_return_alt    = 0.0f;   // altitude to maintain during RTH

// Current LED mission colour
uint8_t led_r = 255, led_g = 255, led_b = 255;

// ============================================================
// GPS Utility — flat-earth ENU conversion
// ============================================================

// Convert GPS (lat, lng) to local ENU metres relative to origin
static void gpsToENU(double lat, double lng,
                     double orig_lat, double orig_lng,
                     float &east, float &north) {
    const float R = 6371000.0f;  // Earth radius m
    float dlat = (float)((lat  - orig_lat)  * DEG_TO_RAD);
    float dlng = (float)((lng  - orig_lng)  * DEG_TO_RAD);
    north = dlat * R;
    east  = dlng * R * cosf((float)(orig_lat * DEG_TO_RAD));
}

// Haversine distance between two GPS coords (metres)
static float gpsDist(double lat1, double lng1, double lat2, double lng2) {
    const float R = 6371000.0f;
    float dlat = (float)((lat2 - lat1) * DEG_TO_RAD);
    float dlng = (float)((lng2 - lng1) * DEG_TO_RAD);
    float a = sinf(dlat/2)*sinf(dlat/2)
            + cosf((float)(lat1*DEG_TO_RAD)) * cosf((float)(lat2*DEG_TO_RAD))
            * sinf(dlng/2)*sinf(dlng/2);
    return R * 2.0f * atan2f(sqrtf(a), sqrtf(1.0f - a));
}

// ============================================================
// Waypoint Interpolation
// ============================================================

// Smooth-step (same as MissionExport / interpolation.js "smooth")
static float smoothStep(float t) {
    return t * t * (3.0f - 2.0f * t);
}

static Waypoint interpolateWaypoints(float t) {
    if (wp_count == 0) return {};
    if (t <= waypoints[0].time) return waypoints[0];
    if (t >= waypoints[wp_count - 1].time) return waypoints[wp_count - 1];

    // Find bracketing pair
    int i = 0;
    for (; i < wp_count - 1; i++) {
        if (waypoints[i].time <= t && waypoints[i + 1].time >= t) break;
    }

    float dt = waypoints[i + 1].time - waypoints[i].time;
    float alpha = (dt > 0.0f) ? (t - waypoints[i].time) / dt : 0.0f;
    alpha = smoothStep(constrain(alpha, 0.0f, 1.0f));

    Waypoint out;
    out.time  = t;
    out.x     = waypoints[i].x   + (waypoints[i+1].x   - waypoints[i].x)   * alpha;
    out.y     = waypoints[i].y   + (waypoints[i+1].y   - waypoints[i].y)   * alpha;
    out.z     = waypoints[i].z   + (waypoints[i+1].z   - waypoints[i].z)   * alpha;
    out.yaw   = waypoints[i].yaw + (waypoints[i+1].yaw - waypoints[i].yaw) * alpha;
    out.pitch = waypoints[i].pitch+(waypoints[i+1].pitch-waypoints[i].pitch)*alpha;
    out.roll  = waypoints[i].roll +(waypoints[i+1].roll -waypoints[i].roll) *alpha;
    out.r     = (uint8_t)(waypoints[i].r + (waypoints[i+1].r - waypoints[i].r) * alpha);
    out.g     = (uint8_t)(waypoints[i].g + (waypoints[i+1].g - waypoints[i].g) * alpha);
    out.b     = (uint8_t)(waypoints[i].b + (waypoints[i+1].b - waypoints[i].b) * alpha);
    return out;
}

// ============================================================
// SD Card
// ============================================================

static void loadConfig() {
    File f = SD.open("/config.txt");
    if (!f) { Serial.println("[SD] /config.txt not found — defaults used"); return; }
    while (f.available()) {
        String line = f.readStringUntil('\n');
        line.trim();
        if (line.startsWith("id="))       drone_id  = (uint8_t)line.substring(3).toInt();
        if (line.startsWith("gps_baud=")) gps_baud  = (uint32_t)line.substring(9).toInt();
    }
    f.close();
    Serial.printf("[SD] id=%d  gps_baud=%d\n", drone_id, gps_baud);
}

// Parse the JSON exported by MissionExport.jsx
// Format: { version, drone, mission:{homePoint,emergencyPoint,geofence,...},
//           waypoints:[{time,x,y,z,yaw,pitch,roll,r,g,b},...] }
static bool loadMission() {
    File f = SD.open("/mission.json");
    if (!f) { Serial.println("[SD] /mission.json not found"); return false; }

    // Stream-parse to save heap; document size ~24 KB handles ~300 waypoints
    DynamicJsonDocument doc(24576);
    DeserializationError err = deserializeJson(doc, f);
    f.close();

    if (err) {
        Serial.printf("[SD] JSON parse error: %s\n", err.c_str());
        return false;
    }

    // Home point
    has_home = false;
    JsonVariant hp = doc["mission"]["homePoint"];
    if (!hp.isNull()) {
        home_lat = hp["lat"].as<double>();
        home_lng = hp["lng"].as<double>();
        has_home = true;
    }

    // Emergency point
    has_emg = false;
    JsonVariant ep = doc["mission"]["emergencyPoint"];
    if (!ep.isNull()) {
        emg_lat = ep["lat"].as<double>();
        emg_lng = ep["lng"].as<double>();
        has_emg = true;
    }

    // Geofence
    geofence_radius = 0;
    JsonVariant gf = doc["mission"]["geofence"];
    if (!gf.isNull()) {
        geofence_lat    = gf["center"]["lat"].as<double>();
        geofence_lng    = gf["center"]["lng"].as<double>();
        geofence_radius = gf["radius"].as<float>();
    }

    // Waypoints
    JsonArray wpa = doc["waypoints"].as<JsonArray>();
    wp_count = 0;
    for (JsonObject wp : wpa) {
        if (wp_count >= MAX_WAYPOINTS) break;
        Waypoint &w  = waypoints[wp_count++];
        w.time  = wp["time"]  | 0.0f;
        w.x     = wp["x"]     | 0.0f;
        w.y     = wp["y"]     | 0.0f;
        w.z     = wp["z"]     | 0.0f;
        w.yaw   = wp["yaw"]   | 0.0f;
        w.pitch = wp["pitch"] | 0.0f;
        w.roll  = wp["roll"]  | 0.0f;
        w.r     = wp["r"]     | 255;
        w.g     = wp["g"]     | 255;
        w.b     = wp["b"]     | 255;
    }

    Serial.printf("[SD] Mission loaded: %d waypoints, home=%s, geofence=%.0fm\n",
                  wp_count,
                  has_home ? "yes" : "no",
                  geofence_radius);
    return wp_count > 0;
}

// ============================================================
// LoRa ISR + helpers
// ============================================================

IRAM_ATTR void loraIsr() { lora_rx_flag = true; }

static void loraSend(const char *json) {
    radio.transmit((uint8_t *)json, strlen(json));
    radio.startReceive();
}

// Send JSON telemetry to ground station
static void sendTelemetry(int wp_index) {
    char buf[200];
    snprintf(buf, sizeof(buf),
        "{\"id\":%d,\"r\":%.1f,\"p\":%.1f,\"y\":%.1f,"
        "\"lat\":%.6f,\"lng\":%.6f,\"alt\":%.1f,"
        "\"arm\":%d,\"mode\":%d,\"wp\":%d,\"bat\":0}",
        drone_id,
        imu_roll, imu_pitch, imu_yaw_rate,
        gps.location.isValid() ? gps.location.lat() : 0.0,
        gps.location.isValid() ? gps.location.lng() : 0.0,
        gps.altitude.isValid() ? gps.altitude.meters() : 0.0,
        armed ? 1 : 0,
        flight_mode,
        wp_index);
    loraSend(buf);
}

// Process incoming LoRa JSON command
static void processCommand(const char *json, size_t len) {
    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, json, len) != DeserializationError::Ok) return;

    const char *cmd = doc["cmd"] | "";

    if (strcmp(cmd, "ping") == 0) {
        char buf[64];
        snprintf(buf, sizeof(buf), "{\"type\":\"pong\",\"id\":%d}", drone_id);
        loraSend(buf);

    } else if (strcmp(cmd, "start") == 0) {
        if (mission_loaded && wp_count > 0) {
            flight_mode      = 2;  // mission
            armed            = true;
            mission_running  = true;
            mission_start_ms = millis();
            Serial.println("[CMD] Mission start");
        } else {
            Serial.println("[CMD] start: no mission loaded");
        }

    } else if (strcmp(cmd, "stop") == 0) {
        mission_running = false;
        flight_mode     = 0;
        armed           = false;
        Serial.println("[CMD] Stop");

    } else if (strcmp(cmd, "emergency") == 0) {
        mission_running = false;
        flight_mode     = 0;
        armed           = false;
        m1 = m2 = m3 = m4 = ESC_PULSE_ARM;
        pidReset(pid_roll); pidReset(pid_pitch); pidReset(pid_yaw);
        Serial.println("[CMD] EMERGENCY STOP");

    } else if (strcmp(cmd, "arm") == 0) {
        // Manual flight: {"cmd":"arm","thr":500,"r":0,"p":0,"y":0,"mode":1}
        sp_throttle = doc["thr"] | 0;
        sp_roll     = (float)(doc["r"] | 0);
        sp_pitch    = (float)(doc["p"] | 0);
        sp_yaw      = (float)(doc["y"] | 0);
        flight_mode = doc["mode"] | 1;
        armed       = true;
        mission_running = false;

    } else if (strcmp(cmd, "reload") == 0) {
        mission_loaded = loadMission();
    }
}

// ============================================================
// LED Patterns
// ============================================================

static void ledsSet(uint8_t r, uint8_t g, uint8_t b) {
    leds.fill(leds.Color(r, g, b));
    leds.show();
}

// Armed navigation lights: white front, red rear, sides from mission colour
static void ledsNavigation(uint8_t mr, uint8_t mg, uint8_t mb) {
    leds.fill(leds.Color(mr, mg, mb));
    leds.setPixelColor(0,  leds.Color(255, 255, 255));  // FL white
    leds.setPixelColor(1,  leds.Color(255, 255, 255));  // FR white
    leds.setPixelColor(14, leds.Color(180, 0,   0));    // RL red
    leds.setPixelColor(15, leds.Color(180, 0,   0));    // RR red
    leds.show();
}

static void ledsUpdate() {
    if (!armed) {
        // Slow blue pulse = disarmed idle
        uint8_t b = (uint8_t)(128 + 127 * sinf((float)millis() / 500.0f));
        ledsSet(0, 0, b);
    } else if (flight_mode == 3) {
        // Return-to-Home: fast orange strobe
        bool on = ((millis() / 150) % 2) == 0;
        ledsNavigation(on ? 255 : 0, on ? 80 : 0, 0);
    } else if (flight_mode == 2 && mission_running) {
        // Mission: waypoint colour on sides, nav lights front/rear
        ledsNavigation(led_r, led_g, led_b);
    } else {
        // Manual / stabilize: green sides
        ledsNavigation(0, 80, 0);
    }
}

// ============================================================
// ESC helpers
// ============================================================

static uint32_t pulseToDuty(uint16_t us) {
    return (uint32_t)(((float)us / (1000000.0f / ESC_PWM_FREQ))
                      * (float)((1u << ESC_PWM_RES) - 1u));
}

static void writeMotors() {
    ledcWrite(0, pulseToDuty(m1));
    ledcWrite(1, pulseToDuty(m2));
    ledcWrite(2, pulseToDuty(m3));
    ledcWrite(3, pulseToDuty(m4));
}

// ============================================================
// Setup
// ============================================================

void setup() {
    Serial.begin(115200);
    Serial.println("\n=== ESP Drone v1 Boot ===");

    // LEDs — early status
    leds.begin();
    leds.setBrightness(80);
    ledsSet(255, 128, 0);  // orange = booting

    // IMU
    imuWire.begin(PIN_SDA_MPU, PIN_SCL_MPU);
    uint8_t mpu_err = mpu.begin();
    if (mpu_err != 0) {
        Serial.printf("[IMU] MPU-6050 error %d\n", mpu_err);
    } else {
        Serial.println("[IMU] MPU-6050 OK  (calibrating — keep still...)");
        mpu.calcOffsets(true, true);  // ~3 s
        Serial.println("[IMU] Calibration done");
    }

    // SD card  (FSPI bus: CLK=IO12, MISO=IO13, MOSI=IO11, CS=IO14)
    SPI.begin(PIN_SD_CLK, PIN_SD_DAT0, PIN_SD_CMD, PIN_SD_CS);
    if (!SD.begin(PIN_SD_CS)) {
        Serial.println("[SD] No card or mount failed");
    } else {
        Serial.println("[SD] Card mounted");
        loadConfig();
        mission_loaded = loadMission();
    }

    // GPS — GEPRC M10 FPV
    gpsSerial.begin(gps_baud, SERIAL_8N1, PIN_GPS_RX, PIN_GPS_TX);
    Serial.printf("[GPS] GEPRC M10 UART1 @ %d baud\n", gps_baud);

    // ESC / LEDC PWM
    ledcSetup(0, ESC_PWM_FREQ, ESC_PWM_RES); ledcAttachPin(PIN_ESC1, 0);
    ledcSetup(1, ESC_PWM_FREQ, ESC_PWM_RES); ledcAttachPin(PIN_ESC2, 1);
    ledcSetup(2, ESC_PWM_FREQ, ESC_PWM_RES); ledcAttachPin(PIN_ESC3, 2);
    ledcSetup(3, ESC_PWM_FREQ, ESC_PWM_RES); ledcAttachPin(PIN_ESC4, 3);
    m1 = m2 = m3 = m4 = ESC_PULSE_ARM;
    writeMotors();
    Serial.println("[ESC] Arming sequence (2 s)...");
    delay(2000);
    Serial.println("[ESC] Armed");

    // LoRa — SX1262 (HSPI: SCK=IO34, MISO=IO41, MOSI=IO40, NSS=IO39)
    loraSPI.begin(PIN_LORA_SCK, PIN_LORA_MISO, PIN_LORA_MOSI, PIN_LORA_NSS);
    int lr = radio.begin(LORA_FREQUENCY, LORA_BANDWIDTH,
                         LORA_SPREADING, LORA_CODING_RATE,
                         LORA_SYNC_WORD, LORA_TX_POWER);
    if (lr != RADIOLIB_ERR_NONE) {
        Serial.printf("[LoRa] SX1262 init failed (err %d)\n", lr);
    } else {
        Serial.printf("[LoRa] SX1262 OK  %.0f MHz  SF%d  BW%.0f kHz\n",
                      LORA_FREQUENCY, LORA_SPREADING, LORA_BANDWIDTH);
        radio.setDio1Action(loraIsr);
        radio.startReceive();
    }

    ledsSet(0, 255, 0);  // green = ready
    delay(500);

    last_loop_us = micros();
    Serial.printf("[SYS] Loop %d Hz  —  Drone ID %d  —  %d waypoints loaded\n",
                  LOOP_RATE_HZ, drone_id, wp_count);
}

// ============================================================
// Main Loop
// ============================================================

void loop() {
    // ── Enforce loop rate ────────────────────────────────────
    unsigned long now_us = micros();
    float dt = (float)(now_us - last_loop_us) * 1e-6f;
    if (dt < (1.0f / LOOP_RATE_HZ)) return;
    last_loop_us = now_us;

    // ── 1. IMU ───────────────────────────────────────────────
    mpu.update();
    imu_roll     = mpu.getAngleX();
    imu_pitch    = mpu.getAngleY();
    imu_yaw_rate = mpu.getGyroZ();

    // ── 2. GPS — feed NMEA parser ────────────────────────────
    while (gpsSerial.available()) gps.encode((char)gpsSerial.read());

    // ── 3. LoRa — receive command ────────────────────────────
    if (lora_rx_flag) {
        lora_rx_flag = false;
        uint8_t buf[220];
        int state = radio.readData(buf, sizeof(buf) - 1);
        if (state == RADIOLIB_ERR_NONE) {
            int rxLen = radio.getPacketLength();
            buf[rxLen] = '\0';
            processCommand((const char *)buf, rxLen);
        }
        radio.startReceive();
    }

    // ── 4. Geofence check ────────────────────────────────────
    if (armed && geofence_radius > 0 && gps.location.isValid()) {
        float dist = gpsDist(gps.location.lat(), gps.location.lng(),
                             geofence_lat, geofence_lng);

        if (dist > geofence_radius) {
            if (!geo_breached) {
                // First breach — initiate Return-to-Home
                geo_breached  = true;
                geo_breach_ms = millis();
                rth_return_alt = gps.altitude.isValid()
                                 ? (float)gps.altitude.meters() : 0.0f;
                mission_running = false;
                flight_mode     = 3;   // RTH
                Serial.printf("[GEO] Breach %.0f m > %.0f m — RTH initiated\n",
                              dist, geofence_radius);
                // Notify ground station
                char buf[80];
                snprintf(buf, sizeof(buf),
                         "{\"type\":\"geo\",\"id\":%d,\"dist\":%.0f,\"rth\":1}",
                         drone_id, dist);
                loraSend(buf);
            }

            // Hard disarm after 90 s of continuous breach
            if (millis() - geo_breach_ms >= GEOFENCE_BREACH_MS) {
                armed       = false;
                flight_mode = 0;
                geo_breached = false;
                m1 = m2 = m3 = m4 = ESC_PULSE_ARM;
                pidReset(pid_roll); pidReset(pid_pitch); pidReset(pid_yaw);
                Serial.println("[GEO] 90 s timeout — HARD DISARM");
                char buf[64];
                snprintf(buf, sizeof(buf),
                         "{\"type\":\"geo\",\"id\":%d,\"disarm\":1}", drone_id);
                loraSend(buf);
            }
        } else {
            // Back inside fence — clear breach flag (if RTH succeeded)
            if (geo_breached && flight_mode == 3) {
                // Reached home area, will disarm below in RTH block
            }
        }
    }

    // ── 5. Flight Control ────────────────────────────────────
    int active_wp = 0;

    if (armed) {
        if (flight_mode == 3) {
            // ── Return-to-Home ─────────────────────────────────
            // Requires homePoint from mission JSON and GPS fix
            if (has_home && gps.location.isValid()) {
                float cur_east, cur_north;
                gpsToENU(gps.location.lat(), gps.location.lng(),
                         home_lat, home_lng,
                         cur_east, cur_north);

                // Horizontal error to home (home = origin = 0,0)
                float err_east  = 0.0f - cur_east;
                float err_north = 0.0f - cur_north;
                float horiz_dist = sqrtf(err_east * err_east + err_north * err_north);

                // Altitude: maintain rth_return_alt while flying back,
                // descend slowly once over home
                float cur_alt = gps.altitude.isValid()
                                ? (float)gps.altitude.meters() : rth_return_alt;
                float target_alt;
                if (horiz_dist > RTH_HOME_RADIUS_M) {
                    target_alt = rth_return_alt;  // keep altitude during transit
                } else {
                    // Over home — descend at RTH_DESCENT_RATE m/s
                    float elapsed = (float)(millis() - geo_breach_ms) / 1000.0f;
                    target_alt = rth_return_alt - RTH_DESCENT_RATE * elapsed;
                }

                float err_alt = target_alt - cur_alt;

                sp_roll     = constrain( POS_P_HORIZ * err_east,  -25.0f, 25.0f);
                sp_pitch    = constrain(-POS_P_HORIZ * err_north, -25.0f, 25.0f);
                sp_yaw      = 0.0f;  // face north during RTH
                sp_throttle = BASE_HOVER_THR
                            + (int)constrain(POS_P_VERT * err_alt, -300.0f, 300.0f);

                // Landed: horizontally home + low altitude → disarm
                if (horiz_dist < RTH_HOME_RADIUS_M && cur_alt < (rth_return_alt - 1.0f)) {
                    armed        = false;
                    flight_mode  = 0;
                    geo_breached = false;
                    Serial.println("[RTH] Landed at home — disarmed");
                    char buf[64];
                    snprintf(buf, sizeof(buf),
                             "{\"type\":\"rth\",\"id\":%d,\"landed\":1}", drone_id);
                    loraSend(buf);
                }
            } else {
                // No GPS or no home — hover in place, wait for fix
                sp_roll = sp_pitch = sp_yaw = 0.0f;
                sp_throttle = BASE_HOVER_THR;
            }
        } else if (flight_mode == 2 && mission_running) {
            // ── Mission mode: GPS position control ────────────
            float t = (float)(millis() - mission_start_ms) / 1000.0f;
            float dur = (wp_count > 0) ? waypoints[wp_count - 1].time : 0.0f;

            if (t > dur) {
                // Mission complete → disarm
                mission_running = false;
                flight_mode     = 0;
                armed           = false;
            } else {
                Waypoint target = interpolateWaypoints(t);

                for (int i = 0; i < wp_count - 1; i++) {
                    if (waypoints[i].time <= t) active_wp = i;
                }

                led_r = target.r;
                led_g = target.g;
                led_b = target.b;

                if (has_home && gps.location.isValid()) {
                    float cur_east, cur_north;
                    gpsToENU(gps.location.lat(), gps.location.lng(),
                             home_lat, home_lng,
                             cur_east, cur_north);

                    float err_east  = target.x - cur_east;
                    float err_north = target.y - cur_north;
                    float err_alt   = target.z
                                    - (float)(gps.altitude.isValid()
                                              ? gps.altitude.meters() : 0.0);

                    sp_roll  = constrain( POS_P_HORIZ * err_east,  -25.0f, 25.0f);
                    sp_pitch = constrain(-POS_P_HORIZ * err_north, -25.0f, 25.0f);
                    sp_yaw   = target.yaw;
                    sp_throttle = BASE_HOVER_THR
                                + (int)constrain(POS_P_VERT * err_alt, -300.0f, 300.0f);
                } else {
                    // No GPS fix — hold attitude from waypoint
                    sp_roll     = target.roll;
                    sp_pitch    = target.pitch;
                    sp_yaw      = target.yaw;
                    sp_throttle = BASE_HOVER_THR;
                }
            }
        }
        // (mode 1 = stabilize: sp_* already set by "arm" command)

        // Attitude PID
        float out_roll  = pidUpdate(pid_roll,  sp_roll,  imu_roll,     dt);
        float out_pitch = pidUpdate(pid_pitch, sp_pitch, imu_pitch,    dt);
        float out_yaw   = pidUpdate(pid_yaw,   sp_yaw,   imu_yaw_rate, dt);

        // X-frame mixer
        //   M1(CW) ── M2(CCW)       Front
        //   M4(CCW)── M3(CW)        Rear
        int base = constrain(sp_throttle, 0, 800) + ESC_PULSE_MIN;
        m1 = (uint16_t)constrain(base + out_roll - out_pitch + out_yaw, ESC_PULSE_MIN, ESC_PULSE_MAX);
        m2 = (uint16_t)constrain(base - out_roll - out_pitch - out_yaw, ESC_PULSE_MIN, ESC_PULSE_MAX);
        m3 = (uint16_t)constrain(base - out_roll + out_pitch + out_yaw, ESC_PULSE_MIN, ESC_PULSE_MAX);
        m4 = (uint16_t)constrain(base + out_roll + out_pitch - out_yaw, ESC_PULSE_MIN, ESC_PULSE_MAX);

    } else {
        m1 = m2 = m3 = m4 = ESC_PULSE_ARM;
        pidReset(pid_roll);
        pidReset(pid_pitch);
        pidReset(pid_yaw);
    }
    writeMotors();

    // ── 6. Telemetry every 200 ms ────────────────────────────
    if (millis() - last_telem_ms >= 200) {
        last_telem_ms = millis();
        sendTelemetry(active_wp);
    }

    // ── 7. LEDs every 50 ms ──────────────────────────────────
    if (millis() - last_led_ms >= 50) {
        last_led_ms = millis();
        ledsUpdate();
    }
}
