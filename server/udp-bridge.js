/**
 * WebSocket to UDP Bridge Server
 *
 * This server bridges the React web app (WebSocket) to ESP32 drones (UDP)
 * - Receives commands from web app via WebSocket
 * - Forwards to drones via UDP on port 8888
 * - Receives telemetry from drones via UDP
 * - Sends telemetry to web app via WebSocket
 */

const WebSocket = require('ws');
const dgram = require('dgram');

const WS_PORT = 3001;
const UDP_PORT = 8888;
const TELEMETRY_PORT = 8889;

// Create WebSocket server
const wss = new WebSocket.Server({ port: WS_PORT });

// Create UDP socket for sending commands to drones
const udpClient = dgram.createSocket('udp4');

// Create UDP socket for receiving telemetry from drones
const udpTelemetry = dgram.createSocket('udp4');
udpTelemetry.bind(TELEMETRY_PORT);

console.log(`WebSocket server running on port ${WS_PORT}`);
console.log(`UDP bridge ready - sending to drones on port ${UDP_PORT}`);
console.log(`Listening for telemetry on port ${TELEMETRY_PORT}`);

// Store connected WebSocket clients
const clients = new Set();

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Web app connected');
  clients.add(ws);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received from web app:', data);

      // Forward to drone via UDP
      if (data.droneIP && data.payload) {
        const buffer = Buffer.from(JSON.stringify(data.payload));

        udpClient.send(buffer, 0, buffer.length, UDP_PORT, data.droneIP, (err) => {
          if (err) {
            console.error('UDP send error:', err);
            ws.send(JSON.stringify({
              type: 'error',
              message: `Failed to send to ${data.droneIP}: ${err.message}`
            }));
          } else {
            console.log(`Sent to ${data.droneIP}:${UDP_PORT}:`, data.payload);
            ws.send(JSON.stringify({
              type: 'success',
              message: `Command sent to ${data.droneIP}`
            }));
          }
        });
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  });

  ws.on('close', () => {
    console.log('Web app disconnected');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });

  // Send initial connection confirmation
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Bridge server connected'
  }));
});

// UDP telemetry handler - receive from drones
udpTelemetry.on('message', (message, remote) => {
  try {
    const telemetry = JSON.parse(message.toString());
    console.log(`Telemetry from ${remote.address}:`, telemetry);

    // Broadcast telemetry to all connected web clients
    const telemetryData = JSON.stringify({
      type: 'telemetry',
      droneIP: remote.address,
      data: telemetry
    });

    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(telemetryData);
      }
    });
  } catch (error) {
    console.error('Error parsing telemetry:', error);
  }
});

udpTelemetry.on('error', (error) => {
  console.error('UDP telemetry error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down bridge server...');
  udpClient.close();
  udpTelemetry.close();
  wss.close();
  process.exit(0);
});

console.log('Bridge server ready!');
console.log('Make sure your ESP32 drones are connected to WiFi and reachable.');
