/*
 * ESP32 WiFi Access Point for Drone Control
 *
 * This ESP32 acts as:
 * - WiFi Access Point for drones to connect
 * - USB/Serial bridge to PC
 * - UDP relay between PC and drones
 * - Drone discovery service
 *
 * Hardware: Any ESP32 board (ESP32-DevKit, etc.)
 * Connection: USB to PC
 *
 * Serial Protocol:
 * - Commands from PC: JSON terminated with \n
 * - Responses to PC: JSON terminated with \n
 *
 * Commands:
 * - {"cmd":"discover"} - Scan for connected drones
 * - {"cmd":"send","ip":"192.168.4.2","data":{...}} - Forward to drone
 * - {"cmd":"broadcast","data":{...}} - Send to all drones
 */

#include <WiFi.h>
#include <WiFiUdp.h>
#include <ArduinoJson.h>

// Access Point Configuration
const char* ap_ssid = "DroneControl-AP";
const char* ap_password = "drone12345";
const IPAddress ap_ip(192, 168, 4, 1);        // AP IP
const IPAddress ap_gateway(192, 168, 4, 1);
const IPAddress ap_subnet(255, 255, 255, 0);

// UDP Configuration
WiFiUDP udp;
const int DRONE_UDP_PORT = 8888;      // Port drones listen on
const int AP_UDP_PORT = 8889;         // Port AP listens on for telemetry
const int DISCOVERY_PORT = 8890;      // Port for drone discovery

// Serial Configuration
#define SERIAL_BAUD 115200
#define SERIAL_BUFFER_SIZE 2048

// Drone tracking
struct ConnectedDrone {
  IPAddress ip;
  String name;
  String bleAddress;
  unsigned long lastSeen;
  bool active;
};

#define MAX_DRONES 10
ConnectedDrone drones[MAX_DRONES];
int droneCount = 0;

// Buffers
char serialBuffer[SERIAL_BUFFER_SIZE];
int serialBufferPos = 0;

// Timing
unsigned long lastDiscovery = 0;
const unsigned long DISCOVERY_INTERVAL = 5000;  // 5 seconds
const unsigned long DRONE_TIMEOUT = 10000;      // 10 seconds

void setup() {
  Serial.begin(SERIAL_BAUD);
  Serial.println("ESP32 Access Point Starting...");

  // Initialize drone list
  for (int i = 0; i < MAX_DRONES; i++) {
    drones[i].active = false;
  }

  // Setup Access Point
  WiFi.softAPConfig(ap_ip, ap_gateway, ap_subnet);
  WiFi.softAP(ap_ssid, ap_password);

  Serial.print("Access Point Started: ");
  Serial.println(ap_ssid);
  Serial.print("AP IP address: ");
  Serial.println(WiFi.softAPIP());

  // Start UDP
  udp.begin(AP_UDP_PORT);
  Serial.print("UDP listening on port ");
  Serial.println(AP_UDP_PORT);

  // Send ready message to PC
  sendToPCJson("status", "ready", "Access Point initialized");

  delay(1000);

  // Initial discovery
  discoverDrones();
}

void loop() {
  // Handle serial commands from PC
  handleSerialInput();

  // Handle UDP packets from drones
  handleUDPInput();

  // Periodic drone discovery
  if (millis() - lastDiscovery > DISCOVERY_INTERVAL) {
    discoverDrones();
    lastDiscovery = millis();
  }

  // Clean up inactive drones
  cleanupDrones();
}

void handleSerialInput() {
  while (Serial.available()) {
    char c = Serial.read();

    if (c == '\n') {
      // End of command
      serialBuffer[serialBufferPos] = '\0';
      processSerialCommand(serialBuffer);
      serialBufferPos = 0;
    } else if (serialBufferPos < SERIAL_BUFFER_SIZE - 1) {
      serialBuffer[serialBufferPos++] = c;
    } else {
      // Buffer overflow - reset
      serialBufferPos = 0;
      sendToPCJson("error", "buffer_overflow", "Serial buffer overflow");
    }
  }
}

void processSerialCommand(const char* jsonStr) {
  StaticJsonDocument<1024> doc;
  DeserializationError error = deserializeJson(doc, jsonStr);

  if (error) {
    sendToPCJson("error", "parse_error", "Failed to parse JSON");
    return;
  }

  const char* cmd = doc["cmd"];

  if (strcmp(cmd, "discover") == 0) {
    // Manual discovery request
    discoverDrones();

  } else if (strcmp(cmd, "send") == 0) {
    // Send to specific drone
    const char* ipStr = doc["ip"];
    JsonObject data = doc["data"];

    if (ipStr && !data.isNull()) {
      IPAddress targetIP;
      if (targetIP.fromString(ipStr)) {
        sendToDrone(targetIP, data);
      } else {
        sendToPCJson("error", "invalid_ip", "Invalid IP address");
      }
    }

  } else if (strcmp(cmd, "broadcast") == 0) {
    // Broadcast to all drones
    JsonObject data = doc["data"];
    if (!data.isNull()) {
      broadcastToDrones(data);
    }

  } else if (strcmp(cmd, "list") == 0) {
    // List connected drones
    sendDroneList();

  } else {
    sendToPCJson("error", "unknown_command", "Unknown command");
  }
}

void handleUDPInput() {
  int packetSize = udp.parsePacket();
  if (packetSize) {
    char packet[512];
    int len = udp.read(packet, sizeof(packet) - 1);
    packet[len] = '\0';

    IPAddress senderIP = udp.remoteIP();

    // Parse telemetry/response from drone
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, packet);

    if (!error) {
      // Update drone in list
      updateDrone(senderIP, doc);

      // Forward telemetry to PC
      StaticJsonDocument<1024> response;
      response["type"] = "telemetry";
      response["ip"] = senderIP.toString();
      response["data"] = doc;

      String output;
      serializeJson(response, output);
      Serial.println(output);
    }
  }
}

void discoverDrones() {
  Serial.println("{\"type\":\"discovery\",\"status\":\"scanning\"}");

  // Broadcast discovery request
  StaticJsonDocument<128> discoveryMsg;
  discoveryMsg["cmd"] = "ping";
  discoveryMsg["from"] = "AP";

  String msg;
  serializeJson(discoveryMsg, msg);

  // Broadcast to subnet
  IPAddress broadcastIP(192, 168, 4, 255);
  udp.beginPacket(broadcastIP, DRONE_UDP_PORT);
  udp.write((uint8_t*)msg.c_str(), msg.length());
  udp.endPacket();

  // Also check WiFi station list
  wifi_sta_list_t stationList;
  esp_wifi_ap_get_sta_list(&stationList);

  Serial.print("{\"type\":\"discovery\",\"status\":\"complete\",\"count\":");
  Serial.print(stationList.num);
  Serial.println("}");
}

void updateDrone(IPAddress ip, JsonDocument& data) {
  // Find existing drone or add new one
  int index = -1;

  // Check if drone already exists
  for (int i = 0; i < MAX_DRONES; i++) {
    if (drones[i].active && drones[i].ip == ip) {
      index = i;
      break;
    }
  }

  // Add new drone if not found
  if (index == -1) {
    for (int i = 0; i < MAX_DRONES; i++) {
      if (!drones[i].active) {
        index = i;
        drones[i].active = true;
        drones[i].ip = ip;
        droneCount++;

        // Notify PC of new drone
        StaticJsonDocument<256> newDroneMsg;
        newDroneMsg["type"] = "drone_connected";
        newDroneMsg["ip"] = ip.toString();
        String output;
        serializeJson(newDroneMsg, output);
        Serial.println(output);

        break;
      }
    }
  }

  if (index >= 0) {
    drones[index].lastSeen = millis();

    // Update drone info if provided
    if (data.containsKey("name")) {
      drones[index].name = data["name"].as<String>();
    }
    if (data.containsKey("bleAddress")) {
      drones[index].bleAddress = data["bleAddress"].as<String>();
    }
  }
}

void sendToDrone(IPAddress ip, JsonObject& data) {
  String msg;
  serializeJson(data, msg);

  udp.beginPacket(ip, DRONE_UDP_PORT);
  udp.write((uint8_t*)msg.c_str(), msg.length());
  udp.endPacket();

  Serial.print("{\"type\":\"sent\",\"ip\":\"");
  Serial.print(ip.toString());
  Serial.println("\"}");
}

void broadcastToDrones(JsonObject& data) {
  String msg;
  serializeJson(data, msg);

  int sentCount = 0;
  for (int i = 0; i < MAX_DRONES; i++) {
    if (drones[i].active) {
      udp.beginPacket(drones[i].ip, DRONE_UDP_PORT);
      udp.write((uint8_t*)msg.c_str(), msg.length());
      udp.endPacket();
      sentCount++;
    }
  }

  Serial.print("{\"type\":\"broadcast\",\"count\":");
  Serial.print(sentCount);
  Serial.println("}");
}

void sendDroneList() {
  StaticJsonDocument<2048> doc;
  doc["type"] = "drone_list";
  JsonArray dronesArray = doc.createNestedArray("drones");

  for (int i = 0; i < MAX_DRONES; i++) {
    if (drones[i].active) {
      JsonObject drone = dronesArray.createNestedObject();
      drone["ip"] = drones[i].ip.toString();
      drone["name"] = drones[i].name;
      drone["bleAddress"] = drones[i].bleAddress;
      drone["lastSeen"] = millis() - drones[i].lastSeen;
    }
  }

  String output;
  serializeJson(doc, output);
  Serial.println(output);
}

void cleanupDrones() {
  static unsigned long lastCleanup = 0;
  if (millis() - lastCleanup < 1000) return;  // Check every second
  lastCleanup = millis();

  for (int i = 0; i < MAX_DRONES; i++) {
    if (drones[i].active && (millis() - drones[i].lastSeen > DRONE_TIMEOUT)) {
      // Drone timeout - mark as inactive
      StaticJsonDocument<256> msg;
      msg["type"] = "drone_disconnected";
      msg["ip"] = drones[i].ip.toString();
      String output;
      serializeJson(msg, output);
      Serial.println(output);

      drones[i].active = false;
      droneCount--;
    }
  }
}

void sendToPCJson(const char* type, const char* status, const char* message) {
  StaticJsonDocument<256> doc;
  doc["type"] = type;
  doc["status"] = status;
  doc["message"] = message;

  String output;
  serializeJson(doc, output);
  Serial.println(output);
}
