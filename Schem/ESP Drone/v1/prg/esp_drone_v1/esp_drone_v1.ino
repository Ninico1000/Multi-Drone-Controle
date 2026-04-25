/*
 * ESP Drone v1 — Flight Controller
 * ============================================================
 * MCU   : ESP32-S2-WROVER
 * IMU   : MPU-6050     (I2C bus 0, SDA=IO5, SCL=IO6)
 * Baro  : BMP280       (I2C bus 0, shared with MPU-6050)
 * Radio : SX1262 LoRa  (SPI HSPI, NSS=IO39, RST=IO21, BUSY=IO38, DIO1=IO37)
 * GPS   : GEPRC M10 FPV (UART1 RX=IO3 ← GPS-TX, TX=IO4 → GPS-RX, 38400 Bd)
 * ESCs  : IO15–IO18    (50 Hz PWM, 1000–2000 µs)
 * LEDs  : 16× WS2812B  (IO26 via 330 Ω)
 * SD    : SPI FSPI     (CMD=IO11, CLK=IO12, DAT0=IO13, CS=IO14)
 *
 * Required libraries (Arduino Library Manager):
 *   RadioLib, MPU6050_light, TinyGPSPlus, Adafruit NeoPixel, ArduinoJson,
 *   Adafruit BMP280, Adafruit Unified Sensor
 *
 * Board: ESP32S2 Dev Module (Espressif esp32 package >= 3.x)
 *
 * SD-Card files:
 *   /config.txt   — id=<1-255>  gps_baud=<38400>
 *   /mission.json — exported from Multi-Drone-Control (MissionExport)
 *   /bb_<id>.csv  — blackbox log (written each armed session)
 *
 * LoRa protocol — JSON text packets (<= 200 bytes):
 *   RX commands : {"cmd":"ping"}
 *                 {"cmd":"start"}
 *                 {"cmd":"stop"}
 *                 {"cmd":"land"}       — soft landing (controlled descent)
 *                 {"cmd":"emergency"}  — hard cutoff (immediate motor stop)
 *                 {"cmd":"arm","thr":500,"r":0,"p":0,"y":0,"mode":1}
 *                 {"cmd":"reload"}     — re-parse mission from RAM cache
 *   TX telemetry: {"id":1,"r":0.1,"p":-0.2,"y":3.1,
 *                  "lat":48.1234,"lng":11.4567,"alt":502.1,
 *                  "agl":2.3,"pres":1013.2,"temp":22.1,
 *                  "arm":1,"mode":2,"wp":12,"bat":0}
 *
 * Waypoint JSON format (no angle fields):
 *   {"time":0,"x":0,"y":0,"z":2,"r":0,"g":200,"b":255,"fn":0,"fp":0}
 *   fn: 0=solid  1=pulse (fp=period ms)  2=strobe (fp=blink interval ms)
 */

#include <Arduino.h>
#include <Wire.h>
#include <SPI.h>
#include <math.h>
#include <Adafruit_NeoPixel.h>
#include <RadioLib.h>
#include <MPU6050_light.h>
#include <TinyGPSPlus.h>
#include <Adafruit_BMP280.h>
#include <SD.h>
#include <ArduinoJson.h>

// ============================================================
// Pin Definitions
// ============================================================

#define PIN_SDA_MPU     5
#define PIN_SCL_MPU     6

#define PIN_GPS_RX      3    // UART1 RX <- GEPRC M10 TX
#define PIN_GPS_TX      4    // UART1 TX -> GEPRC M10 RX
#define PIN_GPS_SDA     1    // I2C1 SDA — GPS module (reserved, UART active)
#define PIN_GPS_SCL     2    // I2C1 SCL — GPS module (reserved, UART active)

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

#define GPS_BAUD_DEFAULT    38400

// BMP280 — I2C Bus 0 (shares bus with MPU-6050)
#define BMP280_I2C_ADDR     0x76    // SDO->GND = 0x76, SDO->VCC = 0x77

#define LORA_FREQUENCY      868.0f
#define LORA_BANDWIDTH      125.0f
#define LORA_SPREADING      7
#define LORA_CODING_RATE    5
#define LORA_SYNC_WORD      0xAB
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

// Position P gains
#define POS_P_HORIZ     0.6f
#define POS_P_VERT      8.0f
#define BASE_HOVER_THR  500

#define MAX_WAYPOINTS          400
#define MISSION_BUF_SIZE       25600  // max raw JSON size in RAM
#define GEOFENCE_BREACH_MS     90000UL
#define RTH_HOME_RADIUS_M      1.5f
#define RTH_DESCENT_RATE       0.3f

// Soft landing
#define LAND_DESCENT_RATE      0.4f   // m/s
#define LAND_DISARM_AGL        0.15f  // m AGL -> disarm

// Flight modes
#define MODE_DISARMED   0
#define MODE_STABILIZE  1
#define MODE_MISSION    2
#define MODE_RTH        3
#define MODE_LAND       4

// LED color functions
#define COLOR_FN_SOLID    0
#define COLOR_FN_PULSE    1
#define COLOR_FN_STROBE   2

// LoRa addressing + TDMA
// Commands from ground must contain "to": drone_id (or 0 = broadcast)
// Telemetry slots: each drone waits (drone_id-1)*TELEM_SLOT_MS within the 200ms cycle
// → up to 4 drones gap-free at 50 ms slots; adjust TELEM_SLOT_MS for larger fleets
#define TELEM_PERIOD_MS    200   // telemetry cycle
#define TELEM_SLOT_MS      50    // per-drone slot width

// Blackbox
#define BB_RECORDS      400   // ring buffer entries in RAM (~14 KB)
#define BB_FLUSH_MS     2000  // flush to SD every 2 s while armed

// ============================================================
// Waypoint — no angle fields; altitude from barometer
// ============================================================

struct Waypoint {
    float    time;
    float    x, y, z;        // metres ENU relative to homePoint
    uint8_t  r, g, b;        // LED colour
    uint8_t  color_fn;       // COLOR_FN_*
    uint16_t color_fp;       // fn parameter (pulse: period ms, strobe: interval ms)
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
// Blackbox record
// ============================================================

struct BBRecord {
    uint32_t t_ms;
    float    roll, pitch, yaw_r;
    float    agl;
    float    pres;
    uint16_t m1, m2, m3, m4;
    uint8_t  mode;
    uint16_t wp;
};

// ============================================================
// Global Objects
// ============================================================

Adafruit_NeoPixel leds(NUM_LEDS, PIN_LED, NEO_GRB + NEO_KHZ800);

TwoWire         imuWire(0);
MPU6050         mpu(imuWire);
Adafruit_BMP280 bmp(&imuWire);

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

uint8_t  drone_id  = 1;
uint32_t gps_baud  = GPS_BAUD_DEFAULT;

uint8_t  flight_mode = MODE_DISARMED;
bool     armed       = false;

float    sp_roll = 0, sp_pitch = 0, sp_yaw = 0;
int      sp_throttle = 0;

float    imu_roll = 0, imu_pitch = 0, imu_yaw_rate = 0;

uint16_t m1 = ESC_PULSE_ARM, m2 = ESC_PULSE_ARM,
         m3 = ESC_PULSE_ARM, m4 = ESC_PULSE_ARM;

volatile bool lora_rx_flag = false;

unsigned long last_loop_us  = 0;
unsigned long last_telem_ms = 0;
unsigned long last_led_ms   = 0;

// LoRa addressing / TDMA
int8_t  last_rssi    = 0;
uint8_t last_seq     = 0;    // last received sequence number

// ── Barometer ────────────────────────────────────────────────
bool          baro_ok       = false;
float         baro_pressure = 0.0f;   // hPa
float         baro_temp     = 0.0f;   // degC
float         baro_alt      = 0.0f;   // m ASL (sea level ref)
float         baro_home_alt = 0.0f;   // ASL at arm -> AGL = baro_alt - baro_home_alt
unsigned long last_baro_ms  = 0;

// ── Mission — raw JSON stays in RAM after first SD read ──────
static char  mission_buf[MISSION_BUF_SIZE];
bool         mission_buf_valid = false;

Waypoint     waypoints[MAX_WAYPOINTS];
int          wp_count       = 0;
bool         mission_loaded = false;

double   home_lat = 0, home_lng = 0;
double   emg_lat  = 0, emg_lng  = 0;
bool     has_home = false, has_emg = false;
float    geofence_radius = 0;
double   geofence_lat = 0, geofence_lng = 0;

bool          mission_running  = false;
unsigned long mission_start_ms = 0;

int32_t       sync_offset      = 0;    // ground_ms - local_ms
bool          mission_armed    = false;
uint32_t      sched_start_ms   = 0;    // local millis to start mission

bool          geo_breached   = false;
unsigned long geo_breach_ms  = 0;
float         rth_return_alt = 0.0f;

// Soft landing state
float         land_start_agl = 0.0f;
unsigned long land_start_ms  = 0;

// Current LED mission colour + function
uint8_t  led_r = 255, led_g = 255, led_b = 255;
uint8_t  led_fn = COLOR_FN_SOLID;
uint16_t led_fp = 0;

// ── Blackbox ─────────────────────────────────────────────────
BBRecord      bb_buf[BB_RECORDS];
uint16_t      bb_head          = 0;
uint16_t      bb_tail          = 0;
uint16_t      bb_count         = 0;
bool          bb_active        = false;
unsigned long bb_last_flush_ms = 0;
unsigned long bb_last_rec_ms   = 0;
File          bb_file;

// ============================================================
// GPS Utility — flat-earth ENU
// ============================================================

static void gpsToENU(double lat, double lng,
                     double orig_lat, double orig_lng,
                     float &east, float &north) {
    const float R = 6371000.0f;
    float dlat = (float)((lat  - orig_lat)  * DEG_TO_RAD);
    float dlng = (float)((lng  - orig_lng)  * DEG_TO_RAD);
    north = dlat * R;
    east  = dlng * R * cosf((float)(orig_lat * DEG_TO_RAD));
}

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

static float smoothStep(float t) {
    return t * t * (3.0f - 2.0f * t);
}

static Waypoint interpolateWaypoints(float t) {
    if (wp_count == 0) return {};
    if (t <= waypoints[0].time) return waypoints[0];
    if (t >= waypoints[wp_count - 1].time) return waypoints[wp_count - 1];

    int i = 0;
    for (; i < wp_count - 1; i++)
        if (waypoints[i].time <= t && waypoints[i + 1].time >= t) break;

    float dt    = waypoints[i + 1].time - waypoints[i].time;
    float alpha = (dt > 0.0f) ? (t - waypoints[i].time) / dt : 0.0f;
    alpha = smoothStep(constrain(alpha, 0.0f, 1.0f));

    Waypoint out;
    out.time     = t;
    out.x        = waypoints[i].x + (waypoints[i+1].x - waypoints[i].x) * alpha;
    out.y        = waypoints[i].y + (waypoints[i+1].y - waypoints[i].y) * alpha;
    out.z        = waypoints[i].z + (waypoints[i+1].z - waypoints[i].z) * alpha;
    out.r        = (uint8_t)(waypoints[i].r + (waypoints[i+1].r - waypoints[i].r) * alpha);
    out.g        = (uint8_t)(waypoints[i].g + (waypoints[i+1].g - waypoints[i].g) * alpha);
    out.b        = (uint8_t)(waypoints[i].b + (waypoints[i+1].b - waypoints[i].b) * alpha);
    out.color_fn = waypoints[i+1].color_fn;
    out.color_fp = waypoints[i+1].color_fp;
    return out;
}

// ============================================================
// SD Card — mission loaded into RAM once, re-parsed on reload
// ============================================================

static void loadConfig() {
    File f = SD.open("/config.txt");
    if (!f) { Serial.println("[SD] /config.txt not found — defaults used"); return; }
    while (f.available()) {
        String line = f.readStringUntil('\n');
        line.trim();
        if (line.startsWith("id="))       drone_id = (uint8_t)line.substring(3).toInt();
        if (line.startsWith("gps_baud=")) gps_baud = (uint32_t)line.substring(9).toInt();
    }
    f.close();
    Serial.printf("[SD] id=%d  gps_baud=%d\n", drone_id, gps_baud);
}

// Parse waypoints from mission_buf[] (already in RAM — no SD access)
static bool parseMissionFromBuf() {
    DynamicJsonDocument doc(24576);
    DeserializationError err = deserializeJson(doc, mission_buf);
    if (err) {
        Serial.printf("[SD] JSON parse error: %s\n", err.c_str());
        return false;
    }

    has_home = false;
    JsonVariant hp = doc["mission"]["homePoint"];
    if (!hp.isNull()) {
        home_lat = hp["lat"].as<double>();
        home_lng = hp["lng"].as<double>();
        has_home = true;
    }

    has_emg = false;
    JsonVariant ep = doc["mission"]["emergencyPoint"];
    if (!ep.isNull()) {
        emg_lat = ep["lat"].as<double>();
        emg_lng = ep["lng"].as<double>();
        has_emg = true;
    }

    geofence_radius = 0;
    JsonVariant gf = doc["mission"]["geofence"];
    if (!gf.isNull()) {
        geofence_lat    = gf["center"]["lat"].as<double>();
        geofence_lng    = gf["center"]["lng"].as<double>();
        geofence_radius = gf["radius"].as<float>();
    }

    JsonArray wpa = doc["waypoints"].as<JsonArray>();
    wp_count = 0;
    for (JsonObject wp : wpa) {
        if (wp_count >= MAX_WAYPOINTS) break;
        Waypoint &w  = waypoints[wp_count++];
        w.time     = wp["time"]  | 0.0f;
        w.x        = wp["x"]     | 0.0f;
        w.y        = wp["y"]     | 0.0f;
        w.z        = wp["z"]     | 0.0f;
        w.r        = wp["r"]     | 255;
        w.g        = wp["g"]     | 255;
        w.b        = wp["b"]     | 255;
        w.color_fn = wp["fn"]    | (uint8_t)COLOR_FN_SOLID;
        w.color_fp = wp["fp"]    | (uint16_t)0;
    }

    Serial.printf("[SD] Mission: %d waypoints, home=%s, geofence=%.0fm\n",
                  wp_count, has_home ? "yes" : "no", geofence_radius);
    return wp_count > 0;
}

// Read /mission.json into RAM buffer, then parse
static bool loadMission() {
    File f = SD.open("/mission.json");
    if (!f) { Serial.println("[SD] /mission.json not found"); return false; }

    size_t len = f.size();
    if (len >= MISSION_BUF_SIZE) {
        Serial.printf("[SD] mission.json too large (%u B, max %u B)\n",
                      len, MISSION_BUF_SIZE - 1);
        f.close();
        return false;
    }

    size_t n = f.readBytes(mission_buf, len);
    f.close();
    mission_buf[n] = '\0';
    mission_buf_valid = (n == len);

    Serial.printf("[SD] mission.json -> RAM (%u B)\n", n);
    return parseMissionFromBuf();
}

// ============================================================
// Blackbox
// ============================================================

static void bbOpen() {
    char path[24];
    snprintf(path, sizeof(path), "/bb_%d.csv", drone_id);
    bb_file = SD.open(path, FILE_WRITE);
    if (!bb_file) { Serial.println("[BB] Failed to open blackbox file"); return; }
    bb_file.println("t_ms,roll,pitch,yaw_r,agl,pres,m1,m2,m3,m4,mode,wp");
    bb_active        = true;
    bb_head          = 0;
    bb_tail          = 0;
    bb_count         = 0;
    bb_last_flush_ms = millis();
    Serial.printf("[BB] Open: %s\n", path);
}

static void bbFlush() {
    if (!bb_active || bb_count == 0) return;
    uint16_t n = bb_count;
    while (n-- > 0) {
        const BBRecord &r = bb_buf[bb_tail];
        bb_file.printf("%lu,%.2f,%.2f,%.2f,%.2f,%.1f,%u,%u,%u,%u,%u,%u\n",
                       r.t_ms, r.roll, r.pitch, r.yaw_r,
                       r.agl, r.pres,
                       r.m1, r.m2, r.m3, r.m4,
                       r.mode, r.wp);
        bb_tail = (bb_tail + 1) % BB_RECORDS;
        bb_count--;
    }
    bb_file.flush();
}

static void bbClose() {
    if (!bb_active) return;
    bbFlush();
    bb_file.close();
    bb_active = false;
    Serial.println("[BB] Closed");
}

static void bbRecord(uint16_t wp_idx) {
    BBRecord &r = bb_buf[bb_head];
    r.t_ms  = millis();
    r.roll  = imu_roll;
    r.pitch = imu_pitch;
    r.yaw_r = imu_yaw_rate;
    r.agl   = baro_ok ? (baro_alt - baro_home_alt) : 0.0f;
    r.pres  = baro_ok ? baro_pressure : 0.0f;
    r.m1 = m1;  r.m2 = m2;  r.m3 = m3;  r.m4 = m4;
    r.mode  = flight_mode;
    r.wp    = wp_idx;

    bb_head = (bb_head + 1) % BB_RECORDS;
    if (bb_count < BB_RECORDS) {
        bb_count++;
    } else {
        bb_tail = (bb_tail + 1) % BB_RECORDS;  // ring: overwrite oldest
    }
}

// ============================================================
// Arm / Disarm helpers
// ============================================================

static void armDrone(uint8_t mode) {
    armed       = true;
    flight_mode = mode;
    if (baro_ok) baro_home_alt = baro_alt;
    bbOpen();
}

static void disarmDrone() {
    armed           = false;
    flight_mode     = MODE_DISARMED;
    mission_running = false;
    m1 = m2 = m3 = m4 = ESC_PULSE_ARM;
    pidReset(pid_roll); pidReset(pid_pitch); pidReset(pid_yaw);
    bbClose();
}

// ============================================================
// LoRa ISR + helpers
// ============================================================

IRAM_ATTR void loraIsr() { lora_rx_flag = true; }

static void loraSend(const char *json) {
    radio.transmit((uint8_t *)json, strlen(json));
    radio.startReceive();
}

static void sendTelemetry(int wp_index) {
    char buf[240];
    snprintf(buf, sizeof(buf),
        "{\"id\":%d,\"r\":%.1f,\"p\":%.1f,\"y\":%.1f,"
        "\"lat\":%.6f,\"lng\":%.6f,\"alt\":%.1f,"
        "\"agl\":%.1f,\"pres\":%.1f,\"temp\":%.1f,"
        "\"arm\":%d,\"mode\":%d,\"wp\":%d,\"rssi\":%d,\"bat\":0}",
        drone_id,
        imu_roll, imu_pitch, imu_yaw_rate,
        gps.location.isValid() ? gps.location.lat() : 0.0,
        gps.location.isValid() ? gps.location.lng() : 0.0,
        gps.altitude.isValid() ? gps.altitude.meters() : 0.0,
        baro_ok ? (baro_alt - baro_home_alt) : 0.0f,
        baro_ok ? baro_pressure : 0.0f,
        baro_ok ? baro_temp     : 0.0f,
        armed ? 1 : 0,
        flight_mode,
        wp_index,
        (int)last_rssi);
    loraSend(buf);
}

static void processCommand(const char *json, size_t len) {
    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, json, len) != DeserializationError::Ok) return;

    // Addressing: "to" must be our drone_id or 0 (broadcast); absent = broadcast
    int to = doc["to"] | 0;
    if (to != 0 && to != (int)drone_id) return;

    const char *cmd = doc["cmd"] | "";

    // ACK critical commands immediately (before acting on them)
    uint8_t seq = doc["seq"] | 0;
    if (seq != last_seq) {
        last_seq = seq;
        const char *ack_cmds[] = { "start", "stop", "land", "emergency", "reload", "timesync" };
        for (const char *ac : ack_cmds) {
            if (strcmp(cmd, ac) == 0) {
                char ack[64];
                snprintf(ack, sizeof(ack),
                         "{\"type\":\"ack\",\"id\":%d,\"seq\":%d}", drone_id, seq);
                loraSend(ack);
                break;
            }
        }
    }

    if (strcmp(cmd, "ping") == 0) {
        char buf[64];
        snprintf(buf, sizeof(buf), "{\"type\":\"pong\",\"id\":%d}", drone_id);
        loraSend(buf);

    } else if (strcmp(cmd, "timesync") == 0) {
        uint32_t t = doc["t"] | (uint32_t)0;
        sync_offset = (int32_t)t - (int32_t)millis();
        char buf[80];
        snprintf(buf, sizeof(buf),
                 "{\"type\":\"timesync\",\"id\":%d,\"offset\":%ld}",
                 drone_id, (long)sync_offset);
        loraSend(buf);

    } else if (strcmp(cmd, "start") == 0) {
        // Pre-flight checks
        char fail_buf[96];
        int preflight_seq = doc["seq"] | 0;
        bool pf_ok = true;

        auto pf_fail = [&](const char *reason) {
            snprintf(fail_buf, sizeof(fail_buf),
                     "{\"type\":\"preflight\",\"id\":%d,\"seq\":%d,\"ok\":0,\"fail\":\"%s\"}",
                     drone_id, preflight_seq, reason);
            loraSend(fail_buf);
            pf_ok = false;
        };

        if (!mission_loaded || wp_count == 0)                          { pf_fail("NO_MISSION"); }
        else if (!baro_ok)                                             { pf_fail("BARO_FAIL"); }
        else if (!gps.location.isValid())                              { pf_fail("NO_GPS_FIX"); }
        else if (gps.satellites.isValid() && gps.satellites.value() < 6) { pf_fail("LOW_SATS"); }
        else if (!has_home)                                            { pf_fail("NO_HOME"); }

        if (!pf_ok) {
            Serial.printf("[CMD] pre-flight fail: %s\n", fail_buf);
        } else {
            char ok_buf[80];
            snprintf(ok_buf, sizeof(ok_buf),
                     "{\"type\":\"preflight\",\"id\":%d,\"seq\":%d,\"ok\":1}",
                     drone_id, preflight_seq);
            loraSend(ok_buf);

            uint32_t at_ms = doc["at"] | (uint32_t)0;
            if (at_ms != 0) {
                mission_armed    = true;
                sched_start_ms   = (uint32_t)((int32_t)at_ms - sync_offset);
                Serial.printf("[CMD] Mission armed, sched @ local ms %u\n", sched_start_ms);
            } else {
                armDrone(MODE_MISSION);
                mission_running  = true;
                mission_start_ms = millis();
                Serial.println("[CMD] Mission start (immediate)");
            }
        }

    } else if (strcmp(cmd, "stop") == 0) {
        disarmDrone();
        Serial.println("[CMD] Stop");

    } else if (strcmp(cmd, "land") == 0) {
        // Soft emergency: controlled descent to ground
        if (armed && flight_mode != MODE_LAND) {
            mission_running = false;
            flight_mode     = MODE_LAND;
            land_start_agl  = baro_ok ? (baro_alt - baro_home_alt) : 2.0f;
            land_start_ms   = millis();
            sp_roll = sp_pitch = sp_yaw = 0.0f;
            Serial.println("[CMD] Soft land");
            char buf[64];
            snprintf(buf, sizeof(buf), "{\"type\":\"land\",\"id\":%d}", drone_id);
            loraSend(buf);
        }

    } else if (strcmp(cmd, "emergency") == 0) {
        // Hard cutoff: immediate motor stop, no controlled descent
        disarmDrone();
        Serial.println("[CMD] HARD CUTOFF");
        char buf[64];
        snprintf(buf, sizeof(buf), "{\"type\":\"cutoff\",\"id\":%d}", drone_id);
        loraSend(buf);

    } else if (strcmp(cmd, "arm") == 0) {
        sp_throttle = doc["thr"] | 0;
        sp_roll     = (float)(doc["r"] | 0);
        sp_pitch    = (float)(doc["p"] | 0);
        sp_yaw      = (float)(doc["y"] | 0);
        armDrone(doc["mode"] | (int)MODE_STABILIZE);

    } else if (strcmp(cmd, "reload") == 0) {
        // Re-parse from RAM — SD not accessed
        if (mission_buf_valid) {
            mission_loaded = parseMissionFromBuf();
            Serial.println("[CMD] Reload from RAM");
        } else {
            mission_loaded = loadMission();
        }
    }
}

// ============================================================
// LED Patterns
// ============================================================

static void ledsSet(uint8_t r, uint8_t g, uint8_t b) {
    leds.fill(leds.Color(r, g, b));
    leds.show();
}

// Apply color function to a base colour and return result
static void evalColorFn(uint8_t br, uint8_t bg, uint8_t bb,
                        uint8_t fn, uint16_t fp,
                        uint8_t &or_, uint8_t &og, uint8_t &ob) {
    switch (fn) {
        case COLOR_FN_PULSE: {
            uint16_t period = fp > 0 ? fp : 1000;
            float phase = (float)(millis() % period) / (float)period;
            float bright = 0.5f + 0.5f * sinf(phase * 2.0f * (float)M_PI);
            or_ = (uint8_t)(br * bright);
            og  = (uint8_t)(bg * bright);
            ob  = (uint8_t)(bb * bright);
            break;
        }
        case COLOR_FN_STROBE: {
            uint16_t interval = fp > 0 ? fp : 200;
            bool on = ((millis() / interval) % 2) == 0;
            or_ = on ? br : 0;
            og  = on ? bg : 0;
            ob  = on ? bb : 0;
            break;
        }
        default:  // COLOR_FN_SOLID
            or_ = br;  og = bg;  ob = bb;
            break;
    }
}

// Armed navigation lights — nav colours fixed, side LEDs use color fn
static void ledsNavigation(uint8_t mr, uint8_t mg, uint8_t mb,
                           uint8_t fn, uint16_t fp) {
    uint8_t sr, sg, sb;
    evalColorFn(mr, mg, mb, fn, fp, sr, sg, sb);

    leds.fill(leds.Color(sr, sg, sb));
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
    } else if (flight_mode == MODE_RTH) {
        // Fast orange strobe = RTH
        bool on = ((millis() / 150) % 2) == 0;
        ledsNavigation(on ? 255 : 0, on ? 80 : 0, 0, COLOR_FN_SOLID, 0);
    } else if (flight_mode == MODE_LAND) {
        // Slow yellow pulse = landing
        ledsNavigation(255, 200, 0, COLOR_FN_PULSE, 800);
    } else if (flight_mode == MODE_MISSION && mission_running) {
        ledsNavigation(led_r, led_g, led_b, led_fn, led_fp);
    } else {
        // Stabilize / idle: green sides
        ledsNavigation(0, 80, 0, COLOR_FN_SOLID, 0);
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

    leds.begin();
    leds.setBrightness(80);
    ledsSet(255, 128, 0);  // orange = booting

    // I2C Bus 0: MPU-6050 + BMP280
    imuWire.begin(PIN_SDA_MPU, PIN_SCL_MPU);

    uint8_t mpu_err = mpu.begin();
    if (mpu_err != 0) {
        Serial.printf("[IMU] MPU-6050 error %d\n", mpu_err);
    } else {
        Serial.println("[IMU] MPU-6050 OK  (calibrating — keep still...)");
        mpu.calcOffsets(true, true);  // ~3 s
        Serial.println("[IMU] Calibration done");
    }

    baro_ok = bmp.begin(BMP280_I2C_ADDR);
    if (!baro_ok) {
        Serial.println("[BARO] BMP280 not found — check address/wiring");
    } else {
        bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,
                        Adafruit_BMP280::SAMPLING_X2,    // temperature
                        Adafruit_BMP280::SAMPLING_X16,   // pressure
                        Adafruit_BMP280::FILTER_X16,
                        Adafruit_BMP280::STANDBY_MS_1);
        baro_alt      = bmp.readAltitude();
        baro_home_alt = baro_alt;
        Serial.printf("[BARO] BMP280 OK  %.1f hPa  %.1f C  alt=%.1f m\n",
                      bmp.readPressure() / 100.0f, bmp.readTemperature(), baro_alt);
    }

    // SD card  (FSPI: CLK=IO12, MISO=IO13, MOSI=IO11, CS=IO14)
    SPI.begin(PIN_SD_CLK, PIN_SD_DAT0, PIN_SD_CMD, PIN_SD_CS);
    if (!SD.begin(PIN_SD_CS)) {
        Serial.println("[SD] No card or mount failed");
    } else {
        Serial.println("[SD] Card mounted");
        loadConfig();
        mission_loaded = loadMission();
    }

    // GPS — GEPRC M10 FPV (UART)
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

    // LoRa — SX1262
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

    // TDMA: stagger telemetry by drone_id so packets don't collide
    // Drone 1 transmits at t=0, drone 2 at t=50ms, drone 3 at t=100ms, etc.
    last_telem_ms = millis() - TELEM_PERIOD_MS + (uint32_t)(drone_id - 1) * TELEM_SLOT_MS;

    last_loop_us = micros();
    Serial.printf("[SYS] Loop %d Hz  —  ID %d  —  %d wp  —  Baro %s  —  TDMA slot %d ms\n",
                  LOOP_RATE_HZ, drone_id, wp_count, baro_ok ? "OK" : "FAIL",
                  (drone_id - 1) * TELEM_SLOT_MS);
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

    // ── 2. Barometer — every 50 ms ───────────────────────────
    if (baro_ok && millis() - last_baro_ms >= 50) {
        last_baro_ms  = millis();
        baro_pressure = bmp.readPressure() / 100.0f;
        baro_temp     = bmp.readTemperature();
        baro_alt      = bmp.readAltitude();
    }

    // ── 3. GPS — feed NMEA parser ────────────────────────────
    while (gpsSerial.available()) gps.encode((char)gpsSerial.read());

    // ── 4. LoRa — receive command ────────────────────────────
    if (lora_rx_flag) {
        lora_rx_flag = false;
        uint8_t buf[220];
        int state = radio.readData(buf, sizeof(buf) - 1);
        if (state == RADIOLIB_ERR_NONE) {
            last_rssi = (int8_t)radio.getRSSI();
            int rxLen = radio.getPacketLength();
            buf[rxLen] = '\0';
            processCommand((const char *)buf, rxLen);
        }
        radio.startReceive();
    }

    // ── 5. Scheduled mission start ──────────────────────────
    if (mission_armed && mission_loaded && wp_count > 0 &&
        (int32_t)(millis() - sched_start_ms) >= 0) {
        mission_armed    = false;
        armDrone(MODE_MISSION);
        mission_running  = true;
        mission_start_ms = millis();
    }

    // ── 6. Geofence ──────────────────────────────────────────
    if (armed && geofence_radius > 0 && gps.location.isValid()) {
        float dist = gpsDist(gps.location.lat(), gps.location.lng(),
                             geofence_lat, geofence_lng);

        if (dist > geofence_radius) {
            if (!geo_breached) {
                geo_breached   = true;
                geo_breach_ms  = millis();
                rth_return_alt = baro_ok ? (baro_alt - baro_home_alt) : 0.0f;
                mission_running = false;
                flight_mode     = MODE_RTH;
                Serial.printf("[GEO] Breach %.0f m > %.0f m — RTH\n",
                              dist, geofence_radius);
                char buf[80];
                snprintf(buf, sizeof(buf),
                         "{\"type\":\"geo\",\"id\":%d,\"dist\":%.0f,\"rth\":1}",
                         drone_id, dist);
                loraSend(buf);
            }

            if (millis() - geo_breach_ms >= GEOFENCE_BREACH_MS) {
                disarmDrone();
                geo_breached = false;
                Serial.println("[GEO] 90 s timeout — HARD DISARM");
                char buf[64];
                snprintf(buf, sizeof(buf),
                         "{\"type\":\"geo\",\"id\":%d,\"disarm\":1}", drone_id);
                loraSend(buf);
            }
        } else {
            if (geo_breached && flight_mode == MODE_RTH)
                geo_breached = false;
        }
    }

    // ── 7. Flight Control ────────────────────────────────────
    int   active_wp = 0;
    float cur_agl   = baro_ok ? (baro_alt - baro_home_alt) : 0.0f;

    if (armed) {

        if (flight_mode == MODE_LAND) {
            // ── Soft landing: descend at fixed rate ───────────
            float elapsed    = (float)(millis() - land_start_ms) / 1000.0f;
            float target_agl = land_start_agl - LAND_DESCENT_RATE * elapsed;
            if (target_agl < 0.0f) target_agl = 0.0f;

            sp_roll     = 0.0f;
            sp_pitch    = 0.0f;
            sp_yaw      = 0.0f;
            sp_throttle = BASE_HOVER_THR
                        + (int)constrain(POS_P_VERT * (target_agl - cur_agl),
                                         -300.0f, 300.0f);

            if (cur_agl <= LAND_DISARM_AGL) {
                disarmDrone();
                Serial.println("[LAND] Touchdown — disarmed");
                char buf[64];
                snprintf(buf, sizeof(buf),
                         "{\"type\":\"land\",\"id\":%d,\"landed\":1}", drone_id);
                loraSend(buf);
            }

        } else if (flight_mode == MODE_RTH) {
            // ── Return-to-Home ─────────────────────────────────
            if (has_home && gps.location.isValid()) {
                float cur_east, cur_north;
                gpsToENU(gps.location.lat(), gps.location.lng(),
                         home_lat, home_lng, cur_east, cur_north);

                float err_east   = 0.0f - cur_east;
                float err_north  = 0.0f - cur_north;
                float horiz_dist = sqrtf(err_east*err_east + err_north*err_north);

                float target_alt = (horiz_dist > RTH_HOME_RADIUS_M)
                    ? rth_return_alt
                    : rth_return_alt - RTH_DESCENT_RATE
                      * ((float)(millis() - geo_breach_ms) / 1000.0f);

                sp_roll     = constrain( POS_P_HORIZ * err_east,  -25.0f, 25.0f);
                sp_pitch    = constrain(-POS_P_HORIZ * err_north, -25.0f, 25.0f);
                sp_yaw      = 0.0f;
                sp_throttle = BASE_HOVER_THR
                            + (int)constrain(POS_P_VERT * (target_alt - cur_agl),
                                             -300.0f, 300.0f);

                if (horiz_dist < RTH_HOME_RADIUS_M && cur_agl < (rth_return_alt - 1.0f)) {
                    disarmDrone();
                    geo_breached = false;
                    Serial.println("[RTH] Landed — disarmed");
                    char buf[64];
                    snprintf(buf, sizeof(buf),
                             "{\"type\":\"rth\",\"id\":%d,\"landed\":1}", drone_id);
                    loraSend(buf);
                }
            } else {
                sp_roll = sp_pitch = sp_yaw = 0.0f;
                sp_throttle = BASE_HOVER_THR;
            }

        } else if (flight_mode == MODE_MISSION && mission_running) {
            // ── Mission: GPS horizontal + baro vertical ────────
            float t   = (float)(millis() - mission_start_ms) / 1000.0f;
            float dur = (wp_count > 0) ? waypoints[wp_count - 1].time : 0.0f;

            if (t > dur) {
                disarmDrone();
            } else {
                Waypoint target = interpolateWaypoints(t);

                for (int i = 0; i < wp_count - 1; i++)
                    if (waypoints[i].time <= t) active_wp = i;

                led_r  = target.r;
                led_g  = target.g;
                led_b  = target.b;
                led_fn = target.color_fn;
                led_fp = target.color_fp;

                if (has_home && gps.location.isValid()) {
                    float cur_east, cur_north;
                    gpsToENU(gps.location.lat(), gps.location.lng(),
                             home_lat, home_lng, cur_east, cur_north);

                    sp_roll     = constrain( POS_P_HORIZ * (target.x - cur_east),
                                            -25.0f, 25.0f);
                    sp_pitch    = constrain(-POS_P_HORIZ * (target.y - cur_north),
                                           -25.0f, 25.0f);
                    sp_yaw      = 0.0f;
                    sp_throttle = BASE_HOVER_THR
                                + (int)constrain(POS_P_VERT * (target.z - cur_agl),
                                                 -300.0f, 300.0f);
                } else {
                    // No GPS — hover at target altitude from baro only
                    sp_roll = sp_pitch = sp_yaw = 0.0f;
                    sp_throttle = BASE_HOVER_THR
                                + (int)constrain(POS_P_VERT * (target.z - cur_agl),
                                                 -300.0f, 300.0f);
                }
            }
        }
        // MODE_STABILIZE: sp_* already set by "arm" command

        // ── Attitude PID ──────────────────────────────────────
        float out_roll  = pidUpdate(pid_roll,  sp_roll,  imu_roll,     dt);
        float out_pitch = pidUpdate(pid_pitch, sp_pitch, imu_pitch,    dt);
        float out_yaw   = pidUpdate(pid_yaw,   sp_yaw,   imu_yaw_rate, dt);

        // X-frame motor mixer
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

    // ── 7. Blackbox — record at ~25 Hz, flush every 2 s ─────
    if (armed && millis() - bb_last_rec_ms >= 40) {
        bb_last_rec_ms = millis();
        bbRecord((uint16_t)active_wp);
    }
    if (bb_active && millis() - bb_last_flush_ms >= BB_FLUSH_MS) {
        bb_last_flush_ms = millis();
        bbFlush();
    }

    // ── 8. Telemetry — TDMA slot (every TELEM_PERIOD_MS, offset by drone_id) ──
    if (millis() - last_telem_ms >= TELEM_PERIOD_MS) {
        last_telem_ms = millis();
        sendTelemetry(active_wp);
    }

    // ── 9. LEDs every 50 ms ──────────────────────────────────
    if (millis() - last_led_ms >= 50) {
        last_led_ms = millis();
        ledsUpdate();
    }
}
