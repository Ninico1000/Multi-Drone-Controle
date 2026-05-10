/**
 * WebSocket to Serial Bridge Server
 *
 * Bridges the React web app (WebSocket) to:
 *   - ESP32 Access Point (role: 'ap')   — LoRa gateway for drone telemetry & mission commands
 *   - LoRa Terminal     (role: 'lora_terminal') — second serial LoRa module for raw monitoring
 *
 * HTTP REST on the same port:
 *   GET  /api/ports                     — list available serial ports
 *   POST /api/ports/connect             — { role, path, baudRate } open a port
 *   POST /api/ports/disconnect          — { role } close a port
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const WS_PORT = 3001;
const ESP32_BAUD_RATE = 115200;

// ── Port registry ─────────────────────────────────────────────────────────────
// Each role has its own port/parser/connected state so they never conflict.
const ports = {
  ap:            { port: null, parser: null, connected: false, path: null, baudRate: ESP32_BAUD_RATE },
  lora_terminal: { port: null, parser: null, connected: false, path: null, baudRate: ESP32_BAUD_RATE },
};

let _seq = 0;

// ── HTTP + Express (REST) + WebSocket ────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

const httpServer = http.createServer(app);
const wss = new WebSocket.Server({ server: httpServer });

// Store connected WebSocket clients
const clients = new Set();

// Discovered drones via ESP32 AP
const discoveredDrones = new Map();

// ── REST: list available serial ports ────────────────────────────────────────
app.get('/api/ports', async (req, res) => {
  try {
    const list = await SerialPort.list();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── REST: connect a role to a specific serial port ───────────────────────────
app.post('/api/ports/connect', async (req, res) => {
  const { role, path, baudRate } = req.body;
  if (!role || !path) return res.status(400).json({ error: 'role and path required' });
  if (!ports[role]) return res.status(400).json({ error: `unknown role: ${role}` });

  try {
    await connectRolePort(role, path, baudRate || ESP32_BAUD_RATE);
    res.json({ ok: true, role, path });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── REST: disconnect a role ──────────────────────────────────────────────────
app.post('/api/ports/disconnect', (req, res) => {
  const { role } = req.body;
  if (!role) return res.status(400).json({ error: 'role required' });
  if (!ports[role]) return res.status(400).json({ error: `unknown role: ${role}` });

  disconnectRolePort(role);
  res.json({ ok: true, role });
});

// ── Generic port open/close ──────────────────────────────────────────────────
async function connectRolePort(role, path, baudRate) {
  // Close any existing connection for this role first
  disconnectRolePort(role);

  return new Promise((resolve, reject) => {
    const sp = new SerialPort({ path, baudRate: parseInt(baudRate, 10), autoOpen: false });
    sp.open((err) => {
      if (err) return reject(err);

      const parser = sp.pipe(new ReadlineParser({ delimiter: '\n' }));
      ports[role].port = sp;
      ports[role].parser = parser;
      ports[role].connected = true;
      ports[role].path = path;
      ports[role].baudRate = baudRate;

      console.log(`[${role}] Connected to ${path} @ ${baudRate}`);
      broadcastToClients({ type: `${role}_connected`, path });

      if (role === 'ap') setupAPHandlers();
      else if (role === 'lora_terminal') setupLoraTerminalHandlers();

      resolve();
    });
  });
}

function disconnectRolePort(role) {
  const entry = ports[role];
  if (entry.port && entry.port.isOpen) {
    entry.port.removeAllListeners();
    entry.parser && entry.parser.removeAllListeners();
    entry.port.close(() => {});
  }
  entry.port = null;
  entry.parser = null;
  entry.connected = false;
  entry.path = null;
}

// ── AP (ESP32 Access Point) handlers ─────────────────────────────────────────
function setupAPHandlers() {
  const { parser, port } = ports.ap;

  parser.on('data', (line) => {
    try {
      const data = JSON.parse(line);
      handleESP32Message(data);
    } catch {
      console.error('[ap] bad JSON:', line);
    }
  });

  port.on('error', (err) => {
    console.error('[ap] serial error:', err.message);
    ports.ap.connected = false;
    broadcastToClients({ type: 'error', message: `AP serial error: ${err.message}` });
  });

  port.on('close', () => {
    console.log('[ap] disconnected, retrying in 3 s…');
    ports.ap.connected = false;
    broadcastToClients({ type: 'ap_disconnected', message: 'ESP32 AP disconnected' });
    setTimeout(() => findAndConnectESP32(), 3000);
  });
}

function handleESP32Message(data) {
  switch (data.type) {
    case 'telemetry':
      broadcastToClients({ type: 'telemetry', droneIP: data.ip, data: data.data });
      break;
    case 'lora_rx':
      broadcastToClients({ type: 'lora_rx', rssi: data.rssi, gw_rssi: data.gw_rssi, data: data.data });
      break;
    case 'drone_connected':
      console.log(`[ap] drone connected: ${data.ip}`);
      broadcastToClients({ type: 'drone_connected', ip: data.ip });
      sendToESP32({ cmd: 'list' });
      break;
    case 'drone_disconnected':
      console.log(`[ap] drone disconnected: ${data.ip}`);
      discoveredDrones.delete(data.ip);
      broadcastToClients({ type: 'drone_disconnected', ip: data.ip });
      break;
    case 'drone_list':
      discoveredDrones.clear();
      data.drones.forEach(d => discoveredDrones.set(d.ip, d));
      broadcastToClients({ type: 'drone_list', drones: data.drones });
      console.log(`[ap] ${data.drones.length} drone(s) discovered`);
      break;
    case 'preflight':
      broadcastToClients({ type: 'preflight', ...data });
      break;
    case 'discovery':
      console.log(`[ap] discovery: ${data.status}`);
      break;
    case 'sent':
    case 'broadcast':
      break;
    case 'error':
      console.error('[ap] error:', data.message);
      broadcastToClients({ type: 'error', message: data.message });
      break;
    default:
      console.log('[ap] unknown:', data);
  }
}

function sendToESP32(command) {
  if (!ports.ap.connected || !ports.ap.port) return false;
  ports.ap.port.write(JSON.stringify(command) + '\n', (err) => {
    if (err) console.error('[ap] write error:', err.message);
  });
  return true;
}

// ── LoRa Terminal handlers ────────────────────────────────────────────────────
function setupLoraTerminalHandlers() {
  const { parser, port } = ports.lora_terminal;

  // Forward every raw line to all browser clients
  parser.on('data', (line) => {
    broadcastToClients({ type: 'lora_terminal_rx', raw: line.trim(), ts: Date.now() });
  });

  port.on('error', (err) => {
    console.error('[lora_terminal] serial error:', err.message);
    ports.lora_terminal.connected = false;
    broadcastToClients({ type: 'lora_terminal_disconnected', path: ports.lora_terminal.path });
  });

  port.on('close', () => {
    console.log('[lora_terminal] disconnected');
    ports.lora_terminal.connected = false;
    broadcastToClients({ type: 'lora_terminal_disconnected', path: ports.lora_terminal.path });
  });
}

// ── Auto-detect and connect ESP32 AP ─────────────────────────────────────────
async function findAndConnectESP32() {
  try {
    const list = await SerialPort.list();
    console.log('[ap] scanning ports…');
    for (const p of list) {
      const isESP32 =
        p.manufacturer?.includes('Silicon Labs') ||
        p.manufacturer?.includes('FTDI') ||
        p.manufacturer?.includes('CP210') ||
        p.manufacturer?.includes('CH340') ||
        p.path.includes('USB') ||
        p.path.includes('ACM');
      if (!isESP32) continue;

      // Skip if already used by lora_terminal
      if (ports.lora_terminal.connected && ports.lora_terminal.path === p.path) continue;

      console.log(`[ap] trying ${p.path}…`);
      try {
        await connectWithHandshake(p.path);
        return true;
      } catch (err) {
        console.log(`[ap] ${p.path} failed: ${err.message}`);
      }
    }
    console.log('[ap] no ESP32 found. Connect via USB or set port manually.');
    return false;
  } catch (err) {
    console.error('[ap] scan error:', err.message);
    return false;
  }
}

// Open AP port and wait for the {"status":"ready"} handshake
function connectWithHandshake(path) {
  return new Promise((resolve, reject) => {
    const sp = new SerialPort({ path, baudRate: ESP32_BAUD_RATE, autoOpen: false });
    sp.open((err) => {
      if (err) return reject(err);

      const parser = sp.pipe(new ReadlineParser({ delimiter: '\n' }));
      const timeout = setTimeout(() => {
        sp.close();
        reject(new Error('timeout waiting for ready'));
      }, 5000);

      parser.once('data', (line) => {
        clearTimeout(timeout);
        try {
          const data = JSON.parse(line);
          if (data.status === 'ready') {
            ports.ap.port = sp;
            ports.ap.parser = parser;
            ports.ap.connected = true;
            ports.ap.path = path;
            console.log(`[ap] connected on ${path}`);
            setupAPHandlers();
            broadcastToClients({ type: 'ap_connected', message: 'ESP32 AP connected' });
            setTimeout(() => sendToESP32({ cmd: 'discover' }), 1000);
            resolve();
          } else {
            sp.close();
            reject(new Error('unexpected handshake response'));
          }
        } catch {
          sp.close();
          reject(new Error('not an ESP32 AP'));
        }
      });
    });
  });
}

// ── WebSocket connection handler ──────────────────────────────────────────────
wss.on('connection', (ws) => {
  console.log('[ws] client connected');
  clients.add(ws);

  // Send current connection state to the new client
  ws.send(JSON.stringify({
    type: 'connected',
    apConnected: ports.ap.connected,
    loraTermConnected: ports.lora_terminal.connected,
    message: ports.ap.connected ? 'Bridge connected' : 'Waiting for ESP32 AP',
  }));

  if (discoveredDrones.size > 0) {
    ws.send(JSON.stringify({ type: 'drone_list', drones: Array.from(discoveredDrones.values()) }));
  }

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw);

      if (data.command === 'discover') {
        sendToESP32({ cmd: 'discover' });

      } else if (data.command === 'list_ports') {
        SerialPort.list().then(list => ws.send(JSON.stringify({ type: 'ports_list', ports: list })));

      } else if (data.cmd === 'timesync') {
        sendToESP32({ cmd: 'timesync', t: Date.now() });

      } else if (data.command === 'funke_to_drone') {
        // Forward RC channel values to a specific drone via the ESP32 AP
        const { droneId, channels } = data;
        if (droneId && Array.isArray(channels)) {
          sendToESP32({ cmd: 'send', to: droneId, seq: ++_seq, payload: { cmd: 'rc', ch: channels } });
        }

      } else if (data.droneIP && data.payload) {
        sendToESP32({ cmd: 'send', ip: data.droneIP, data: data.payload });

      } else if (data.command === 'broadcast' && data.payload) {
        sendToESP32({ cmd: 'broadcast', data: data.payload });
      }
    } catch (err) {
      console.error('[ws] message error:', err.message);
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });

  ws.on('close', () => { clients.delete(ws); });
  ws.on('error', () => { clients.delete(ws); });
});

function broadcastToClients(data) {
  const msg = JSON.stringify(data);
  clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

// ── Periodic drone list refresh ───────────────────────────────────────────────
setInterval(() => { if (ports.ap.connected) sendToESP32({ cmd: 'list' }); }, 10000);

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\nShutting down…');
  disconnectRolePort('ap');
  disconnectRolePort('lora_terminal');
  wss.close();
  httpServer.close();
  process.exit(0);
});

// ── Startup ───────────────────────────────────────────────────────────────────
console.log('='.repeat(60));
console.log('  ESP32 Access Point Bridge Server');
console.log(`  WebSocket + REST  →  port ${WS_PORT}`);
console.log('='.repeat(60));

httpServer.listen(WS_PORT, () => {
  console.log(`[server] listening on port ${WS_PORT}`);
  findAndConnectESP32();
});
