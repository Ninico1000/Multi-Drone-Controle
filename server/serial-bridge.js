/**
 * WebSocket to Serial Bridge Server
 *
 * This server bridges the React web app (WebSocket) to ESP32 Access Point (Serial/USB)
 * - Auto-detects ESP32 Access Point on COM ports
 * - Receives commands from web app via WebSocket
 * - Forwards to ESP32 AP via Serial
 * - Receives telemetry/responses from ESP32 AP
 * - Sends to web app via WebSocket
 */

const WebSocket = require('ws');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const WS_PORT = 3001;
const ESP32_BAUD_RATE = 115200;

// WebSocket server
const wss = new WebSocket.Server({ port: WS_PORT });

// Serial connection
let serialPort = null;
let parser = null;
let isConnected = false;

// Store connected WebSocket clients
const clients = new Set();

// Discovered drones
const discoveredDrones = new Map();

console.log(`WebSocket server running on port ${WS_PORT}`);
console.log('Searching for ESP32 Access Point...\n');

// Auto-detect and connect to ESP32
async function findAndConnectESP32() {
  try {
    const ports = await SerialPort.list();
    console.log('Available COM ports:');

    for (const port of ports) {
      console.log(`  ${port.path}: ${port.manufacturer || 'Unknown'}`);

      // Look for ESP32 devices
      if (
        port.manufacturer?.includes('Silicon Labs') ||
        port.manufacturer?.includes('FTDI') ||
        port.manufacturer?.includes('CP210') ||
        port.manufacturer?.includes('CH340') ||
        port.path.includes('USB') ||
        port.path.includes('ACM')
      ) {
        console.log(`\nAttempting to connect to ${port.path}...`);

        try {
          await connectToPort(port.path);
          return true;
        } catch (error) {
          console.log(`Failed to connect to ${port.path}: ${error.message}`);
        }
      }
    }

    console.log('\nNo ESP32 Access Point found. Please connect ESP32 via USB.');
    return false;
  } catch (error) {
    console.error('Error listing ports:', error);
    return false;
  }
}

async function connectToPort(portPath) {
  return new Promise((resolve, reject) => {
    serialPort = new SerialPort({
      path: portPath,
      baudRate: ESP32_BAUD_RATE,
      autoOpen: false
    });

    serialPort.open((err) => {
      if (err) {
        reject(err);
        return;
      }

      // Setup line parser
      parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

      // Wait for "ready" message from ESP32
      const timeout = setTimeout(() => {
        serialPort.close();
        reject(new Error('Timeout waiting for ESP32 ready signal'));
      }, 5000);

      parser.once('data', (line) => {
        clearTimeout(timeout);

        try {
          const data = JSON.parse(line);
          if (data.status === 'ready') {
            isConnected = true;
            console.log(`✓ Connected to ESP32 Access Point on ${portPath}`);
            console.log(`  ${data.message}\n`);

            setupSerialHandlers();
            broadcastToClients({ type: 'ap_connected', message: 'ESP32 AP connected' });

            // Request initial drone list
            setTimeout(() => {
              sendToESP32({ cmd: 'discover' });
            }, 1000);

            resolve();
          } else {
            serialPort.close();
            reject(new Error('Invalid response from device'));
          }
        } catch (e) {
          serialPort.close();
          reject(new Error('Not an ESP32 Access Point'));
        }
      });
    });
  });
}

function setupSerialHandlers() {
  parser.on('data', (line) => {
    try {
      const data = JSON.parse(line);
      handleESP32Message(data);
    } catch (error) {
      console.error('Error parsing ESP32 message:', line);
    }
  });

  serialPort.on('error', (error) => {
    console.error('Serial port error:', error);
    isConnected = false;
    broadcastToClients({ type: 'error', message: `Serial error: ${error.message}` });
  });

  serialPort.on('close', () => {
    console.log('Serial port closed. Attempting to reconnect...');
    isConnected = false;
    broadcastToClients({ type: 'ap_disconnected', message: 'ESP32 AP disconnected' });

    setTimeout(() => {
      findAndConnectESP32();
    }, 3000);
  });
}

function handleESP32Message(data) {
  console.log('From ESP32:', data);

  switch (data.type) {
    case 'telemetry':
      // Forward telemetry to web clients
      broadcastToClients({
        type: 'telemetry',
        droneIP: data.ip,
        data: data.data
      });
      break;

    case 'drone_connected':
      console.log(`✓ Drone connected: ${data.ip}`);
      broadcastToClients({
        type: 'drone_connected',
        ip: data.ip
      });
      // Request updated drone list
      sendToESP32({ cmd: 'list' });
      break;

    case 'drone_disconnected':
      console.log(`✗ Drone disconnected: ${data.ip}`);
      discoveredDrones.delete(data.ip);
      broadcastToClients({
        type: 'drone_disconnected',
        ip: data.ip
      });
      break;

    case 'drone_list':
      discoveredDrones.clear();
      data.drones.forEach(drone => {
        discoveredDrones.set(drone.ip, drone);
      });
      broadcastToClients({
        type: 'drone_list',
        drones: data.drones
      });
      console.log(`Discovered ${data.drones.length} drone(s)`);
      break;

    case 'discovery':
      console.log(`Discovery: ${data.status} ${data.count ? `(${data.count} stations)` : ''}`);
      break;

    case 'sent':
    case 'broadcast':
      // Command acknowledged
      break;

    case 'error':
      console.error(`ESP32 error: ${data.message}`);
      broadcastToClients({
        type: 'error',
        message: data.message
      });
      break;

    default:
      console.log('Unknown message type:', data.type);
  }
}

function sendToESP32(command) {
  if (!isConnected || !serialPort) {
    console.error('ESP32 not connected');
    return false;
  }

  const json = JSON.stringify(command) + '\n';
  serialPort.write(json, (err) => {
    if (err) {
      console.error('Error writing to serial:', err);
    }
  });

  return true;
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Web app connected');
  clients.add(ws);

  // Send current status
  ws.send(JSON.stringify({
    type: 'connected',
    apConnected: isConnected,
    message: isConnected ? 'Bridge server connected' : 'Waiting for ESP32 AP'
  }));

  // Send current drone list if available
  if (discoveredDrones.size > 0) {
    ws.send(JSON.stringify({
      type: 'drone_list',
      drones: Array.from(discoveredDrones.values())
    }));
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('From web app:', data);

      if (data.command === 'discover') {
        // Manual drone discovery
        sendToESP32({ cmd: 'discover' });

      } else if (data.droneIP && data.payload) {
        // Send command to specific drone
        sendToESP32({
          cmd: 'send',
          ip: data.droneIP,
          data: data.payload
        });

      } else if (data.command === 'broadcast' && data.payload) {
        // Broadcast to all drones
        sendToESP32({
          cmd: 'broadcast',
          data: data.payload
        });
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
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
});

function broadcastToClients(data) {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Periodic drone discovery (every 10 seconds)
setInterval(() => {
  if (isConnected) {
    sendToESP32({ cmd: 'list' });
  }
}, 10000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down bridge server...');
  if (serialPort && serialPort.isOpen) {
    serialPort.close();
  }
  wss.close();
  process.exit(0);
});

// Start auto-detection
console.log('='.repeat(60));
console.log('ESP32 Access Point Bridge Server');
console.log('='.repeat(60));
findAndConnectESP32();
