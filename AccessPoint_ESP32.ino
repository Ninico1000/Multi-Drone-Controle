/*
 * ESP32 LoRa Gateway — Multi-Drone Control
 * ============================================================
 * MCU  : ESP32 (TTGO-style)
 * Radio: SX1262 LoRa
 *
 * LoRa settings: 868 MHz, SF7, BW125, CR4/5, SyncWord 0xAB, 14 dBm
 *
 * SX1262 pin mapping (TTGO-style):
 *   SCK   -> 5
 *   MISO  -> 19
 *   MOSI  -> 27
 *   NSS   -> 18
 *   RESET -> 23
 *   BUSY  -> 26
 *   DIO1  -> 33
 *
 * USB Serial protocol (newline-terminated JSON):
 *   PC -> GW:
 *     {"cmd":"send","to":1,"seq":5,"payload":{"cmd":"start"}}
 *     {"cmd":"broadcast","seq":6,"payload":{"cmd":"emergency"}}
 *     {"cmd":"timesync"}
 *   GW -> PC:
 *     {"type":"lora_rx","rssi":-45,"data":{...}}
 *     {"type":"gw_status","status":"ready"}
 *     {"type":"error","msg":"..."}
 */

#include <Arduino.h>
#include <SPI.h>
#include <RadioLib.h>
#include <ArduinoJson.h>

// ============================================================
// Pin Definitions
// ============================================================

#define GW_LORA_SCK   5
#define GW_LORA_MISO  19
#define GW_LORA_MOSI  27
#define GW_LORA_NSS   18
#define GW_LORA_RESET 23
#define GW_LORA_BUSY  26
#define GW_LORA_DIO1  33

// ============================================================
// LoRa Configuration
// ============================================================

#define LORA_FREQUENCY    868.0f
#define LORA_BANDWIDTH    125.0f
#define LORA_SPREADING    7
#define LORA_CODING_RATE  5
#define LORA_SYNC_WORD    0xAB
#define LORA_TX_POWER     14

// ============================================================
// Serial Configuration
// ============================================================

#define SERIAL_BAUD        115200
#define SERIAL_BUFFER_SIZE 512

// ============================================================
// Global objects
// ============================================================

SPIClass loraSPI(VSPI);
SX1262 radio = new Module(GW_LORA_NSS, GW_LORA_DIO1,
                           GW_LORA_RESET, GW_LORA_BUSY, loraSPI);

volatile bool lora_rx_flag = false;

char serialBuffer[SERIAL_BUFFER_SIZE];
int  serialBufferPos = 0;

// Per-drone last seen seq (drone id 1..255 -> index 0..254)
uint8_t drone_last_seq[256] = {0};

// ============================================================
// LoRa ISR
// ============================================================

IRAM_ATTR void loraIsr() { lora_rx_flag = true; }

// ============================================================
// Helpers
// ============================================================

static void loraSendRaw(const char *json) {
    radio.transmit((uint8_t *)json, strlen(json));
    radio.startReceive();
}

static void sendToPC(const char *json) {
    Serial.println(json);
}

static void sendErrorToPC(const char *msg) {
    StaticJsonDocument<128> doc;
    doc["type"] = "error";
    doc["msg"]  = msg;
    String out;
    serializeJson(doc, out);
    Serial.println(out);
}

// ============================================================
// Serial input
// ============================================================

void handleSerialInput() {
    while (Serial.available()) {
        char c = Serial.read();
        if (c == '\n') {
            serialBuffer[serialBufferPos] = '\0';
            if (serialBufferPos > 0) processSerialCommand(serialBuffer);
            serialBufferPos = 0;
        } else if (serialBufferPos < SERIAL_BUFFER_SIZE - 1) {
            serialBuffer[serialBufferPos++] = c;
        } else {
            serialBufferPos = 0;
            sendErrorToPC("serial_buffer_overflow");
        }
    }
}

void processSerialCommand(const char *jsonStr) {
    StaticJsonDocument<512> doc;
    if (deserializeJson(doc, jsonStr) != DeserializationError::Ok) {
        sendErrorToPC("json_parse_error");
        return;
    }

    const char *cmd = doc["cmd"] | "";

    if (strcmp(cmd, "send") == 0) {
        // Forward to a specific drone by id
        uint8_t to  = doc["to"]  | 0;
        uint8_t seq = doc["seq"] | 0;

        StaticJsonDocument<256> pkt;
        pkt["to"]  = to;
        pkt["seq"] = seq;
        JsonObject payload = doc["payload"].as<JsonObject>();
        for (auto kv : payload) pkt[kv.key()] = kv.value();

        char out[256];
        serializeJson(pkt, out, sizeof(out));
        loraSendRaw(out);

    } else if (strcmp(cmd, "broadcast") == 0) {
        // Broadcast to all drones (to=0)
        uint8_t seq = doc["seq"] | 0;

        StaticJsonDocument<256> pkt;
        pkt["to"]  = 0;
        pkt["seq"] = seq;
        JsonObject payload = doc["payload"].as<JsonObject>();
        for (auto kv : payload) pkt[kv.key()] = kv.value();

        char out[256];
        serializeJson(pkt, out, sizeof(out));
        loraSendRaw(out);

    } else if (strcmp(cmd, "timesync") == 0) {
        // Build timesync packet and broadcast to all drones
        StaticJsonDocument<128> pkt;
        pkt["to"]  = 0;
        pkt["cmd"] = "timesync";
        pkt["t"]   = (uint32_t)millis();

        char out[128];
        serializeJson(pkt, out, sizeof(out));
        loraSendRaw(out);

    } else {
        sendErrorToPC("unknown_command");
    }
}

// ============================================================
// LoRa receive handler
// ============================================================

void handleLoraRx() {
    lora_rx_flag = false;

    uint8_t buf[220];
    int state = radio.readData(buf, sizeof(buf) - 1);
    radio.startReceive();

    if (state != RADIOLIB_ERR_NONE) return;

    int rxLen = radio.getPacketLength();
    float rssi = radio.getRSSI();
    buf[rxLen] = '\0';

    // Parse to check for duplicate ACKs
    StaticJsonDocument<512> inner;
    bool isDup = false;
    if (deserializeJson(inner, buf, rxLen) == DeserializationError::Ok) {
        uint8_t drone_id = inner["id"] | 0;
        const char *type = inner["type"] | "";
        uint8_t seq      = inner["seq"] | 0;

        if (drone_id > 0 && strcmp(type, "ack") == 0) {
            if (drone_last_seq[drone_id] == seq) {
                isDup = true;
            } else {
                drone_last_seq[drone_id] = seq;
            }
        }
    }

    if (isDup) return;

    // Forward to PC with added rssi field
    StaticJsonDocument<640> out;
    out["type"]    = "lora_rx";
    out["rssi"]    = (int)rssi;
    out["gw_rssi"] = (int)rssi;
    out["data"]    = inner;

    char outStr[640];
    serializeJson(out, outStr, sizeof(outStr));
    Serial.println(outStr);
}

// ============================================================
// Setup
// ============================================================

void setup() {
    Serial.begin(SERIAL_BAUD);
    Serial.println("{\"type\":\"gw_status\",\"status\":\"booting\"}");

    loraSPI.begin(GW_LORA_SCK, GW_LORA_MISO, GW_LORA_MOSI, GW_LORA_NSS);

    int lr = radio.begin(LORA_FREQUENCY, LORA_BANDWIDTH,
                         LORA_SPREADING, LORA_CODING_RATE,
                         LORA_SYNC_WORD, LORA_TX_POWER);

    if (lr != RADIOLIB_ERR_NONE) {
        char err[80];
        snprintf(err, sizeof(err),
                 "{\"type\":\"gw_status\",\"status\":\"lora_fail\",\"code\":%d}", lr);
        Serial.println(err);
    } else {
        radio.setDio1Action(loraIsr);
        radio.startReceive();
        Serial.println("{\"type\":\"gw_status\",\"status\":\"ready\"}");
    }
}

// ============================================================
// Main Loop
// ============================================================

void loop() {
    handleSerialInput();

    if (lora_rx_flag) {
        handleLoraRx();
    }
}
