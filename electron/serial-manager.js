// Serial Port Manager — ported from server/serial-bridge.js
//
// Same port-registry concept (roles: 'ap' for ESP32 Access Point / LoRa gateway,
// 'lora_terminal' for raw monitoring), but stripped of HTTP/WebSocket layer.
//
// Callers (electron/main.js → IPC handlers) interact via:
//   - listPorts()                                    Promise<PortInfo[]>
//   - connectRole(role, path, baudRate)              Promise<void>
//   - disconnectRole(role)                           void
//   - sendToESP32(commandObj)                        boolean
//   - autoDetectAP()                                 Promise<boolean>
//   - sendToDrone(droneIP, payload)                  boolean
//   - broadcastToDrones(payload)                     boolean
//   - sendFunkeChannels(droneId, channels)           boolean
//   - sendTimesync()                                 boolean
//
// Subscription (main process consumes these and forwards to renderer via IPC):
//   - on('event', handler)                           EventEmitter
//
//   Emitted events match the existing WS protocol payloads so droneConnection.js
//   barely needs to change between web and desktop modes:
//     'ap_connected'         { message }
//     'ap_disconnected'      { message }
//     'telemetry'            { droneIP, data }
//     'lora_rx'              { rssi, gw_rssi, data }
//     'lora_terminal_rx'     { raw, ts }
//     'lora_terminal_disconnected' { path }
//     'drone_connected'      { ip }
//     'drone_disconnected'   { ip }
//     'drone_list'           { drones }
//     'preflight'            { id, ok, fail, ... }
//     'ports_list'           { ports }
//     'error'                { message }

const { EventEmitter } = require('events');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const ESP32_BAUD_RATE = 115200;

class SerialManager extends EventEmitter {
  constructor() {
    super();
    this.ports = {
      ap:            { port: null, parser: null, connected: false, path: null, baudRate: ESP32_BAUD_RATE },
      lora_terminal: { port: null, parser: null, connected: false, path: null, baudRate: ESP32_BAUD_RATE },
    };
    this._seq = 0;
    this.discoveredDrones = new Map();
    this._autoReconnectTimer = null;
    this._listRefreshTimer = null;
  }

  // ─── Discovery / listing ────────────────────────────────────────────────────
  async listPorts() {
    return SerialPort.list();
  }

  // ─── Connect / disconnect by role ────────────────────────────────────────────
  async connectRole(role, path, baudRate = ESP32_BAUD_RATE) {
    if (!this.ports[role]) throw new Error(`unknown role: ${role}`);
    this.disconnectRole(role);

    return new Promise((resolve, reject) => {
      const sp = new SerialPort({ path, baudRate: parseInt(baudRate, 10), autoOpen: false });
      sp.open((err) => {
        if (err) return reject(err);

        const parser = sp.pipe(new ReadlineParser({ delimiter: '\n' }));
        this.ports[role].port = sp;
        this.ports[role].parser = parser;
        this.ports[role].connected = true;
        this.ports[role].path = path;
        this.ports[role].baudRate = baudRate;

        console.log(`[${role}] Connected to ${path} @ ${baudRate}`);
        this.emit(`${role}_connected`, { path });

        if (role === 'ap') this._setupAPHandlers();
        else if (role === 'lora_terminal') this._setupLoraTerminalHandlers();

        resolve();
      });
    });
  }

  disconnectRole(role) {
    const entry = this.ports[role];
    if (!entry) return;
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

  isConnected(role) {
    return !!(this.ports[role] && this.ports[role].connected);
  }

  // ─── AP (ESP32 Access Point) ─────────────────────────────────────────────────
  _setupAPHandlers() {
    const { parser, port } = this.ports.ap;

    parser.on('data', (line) => {
      try {
        const data = JSON.parse(line);
        this._handleESP32Message(data);
      } catch {
        console.error('[ap] bad JSON:', line);
      }
    });

    port.on('error', (err) => {
      console.error('[ap] serial error:', err.message);
      this.ports.ap.connected = false;
      this.emit('error', { message: `AP serial error: ${err.message}` });
    });

    port.on('close', () => {
      console.log('[ap] disconnected, retrying in 3 s…');
      this.ports.ap.connected = false;
      this.emit('ap_disconnected', { message: 'ESP32 AP disconnected' });
      this._autoReconnectTimer = setTimeout(() => this.autoDetectAP(), 3000);
    });
  }

  _handleESP32Message(data) {
    switch (data.type) {
      case 'telemetry':
        this.emit('telemetry', { droneIP: data.ip, data: data.data });
        break;
      case 'lora_rx':
        this.emit('lora_rx', { rssi: data.rssi, gw_rssi: data.gw_rssi, data: data.data });
        break;
      case 'drone_connected':
        console.log(`[ap] drone connected: ${data.ip}`);
        this.emit('drone_connected', { ip: data.ip });
        this.sendToESP32({ cmd: 'list' });
        break;
      case 'drone_disconnected':
        console.log(`[ap] drone disconnected: ${data.ip}`);
        this.discoveredDrones.delete(data.ip);
        this.emit('drone_disconnected', { ip: data.ip });
        break;
      case 'drone_list':
        this.discoveredDrones.clear();
        data.drones.forEach(d => this.discoveredDrones.set(d.ip, d));
        this.emit('drone_list', { drones: data.drones });
        console.log(`[ap] ${data.drones.length} drone(s) discovered`);
        break;
      case 'preflight':
        this.emit('preflight', data);
        break;
      case 'discovery':
        console.log(`[ap] discovery: ${data.status}`);
        break;
      case 'sent':
      case 'broadcast':
        break;
      case 'error':
        console.error('[ap] error:', data.message);
        this.emit('error', { message: data.message });
        break;
      default:
        console.log('[ap] unknown:', data);
    }
  }

  sendToESP32(command) {
    if (!this.ports.ap.connected || !this.ports.ap.port) return false;
    this.ports.ap.port.write(JSON.stringify(command) + '\n', (err) => {
      if (err) console.error('[ap] write error:', err.message);
    });
    return true;
  }

  // ─── LoRa Terminal (raw monitor) ────────────────────────────────────────────
  _setupLoraTerminalHandlers() {
    const { parser, port } = this.ports.lora_terminal;

    parser.on('data', (line) => {
      this.emit('lora_terminal_rx', { raw: line.trim(), ts: Date.now() });
    });

    port.on('error', (err) => {
      console.error('[lora_terminal] serial error:', err.message);
      this.ports.lora_terminal.connected = false;
      this.emit('lora_terminal_disconnected', { path: this.ports.lora_terminal.path });
    });

    port.on('close', () => {
      console.log('[lora_terminal] disconnected');
      this.ports.lora_terminal.connected = false;
      this.emit('lora_terminal_disconnected', { path: this.ports.lora_terminal.path });
    });
  }

  // ─── Auto-detect ESP32 AP ────────────────────────────────────────────────────
  async autoDetectAP() {
    try {
      const list = await SerialPort.list();
      console.log('[ap] scanning ports…');
      for (const p of list) {
        const isESP32 =
          (p.manufacturer && (
            p.manufacturer.includes('Silicon Labs') ||
            p.manufacturer.includes('FTDI') ||
            p.manufacturer.includes('CP210') ||
            p.manufacturer.includes('CH340')
          )) ||
          p.path.includes('USB') ||
          p.path.includes('ACM');
        if (!isESP32) continue;

        if (this.ports.lora_terminal.connected && this.ports.lora_terminal.path === p.path) continue;

        console.log(`[ap] trying ${p.path}…`);
        try {
          await this._connectWithHandshake(p.path);
          return true;
        } catch (err) {
          console.log(`[ap] ${p.path} failed: ${err.message}`);
        }
      }
      console.log('[ap] no ESP32 found.');
      return false;
    } catch (err) {
      console.error('[ap] scan error:', err.message);
      return false;
    }
  }

  _connectWithHandshake(path) {
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
              this.ports.ap.port = sp;
              this.ports.ap.parser = parser;
              this.ports.ap.connected = true;
              this.ports.ap.path = path;
              console.log(`[ap] connected on ${path}`);
              this._setupAPHandlers();
              this.emit('ap_connected', { message: 'ESP32 AP connected' });
              setTimeout(() => this.sendToESP32({ cmd: 'discover' }), 1000);
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

  // ─── High-level command wrappers (called from IPC handlers) ─────────────────
  sendToDrone(droneIP, payload) {
    return this.sendToESP32({ cmd: 'send', ip: droneIP, data: payload });
  }

  broadcastToDrones(payload) {
    return this.sendToESP32({ cmd: 'broadcast', data: payload });
  }

  sendFunkeChannels(droneId, channels) {
    if (!droneId || !Array.isArray(channels)) return false;
    return this.sendToESP32({
      cmd: 'send',
      to: droneId,
      seq: ++this._seq,
      payload: { cmd: 'rc', ch: channels },
    });
  }

  sendTimesync() {
    return this.sendToESP32({ cmd: 'timesync', t: Date.now() });
  }

  triggerDiscover() {
    return this.sendToESP32({ cmd: 'discover' });
  }

  requestDroneList() {
    return this.sendToESP32({ cmd: 'list' });
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────
  startPeriodicListRefresh(intervalMs = 10000) {
    this.stopPeriodicListRefresh();
    this._listRefreshTimer = setInterval(() => {
      if (this.ports.ap.connected) this.requestDroneList();
    }, intervalMs);
  }

  stopPeriodicListRefresh() {
    if (this._listRefreshTimer) {
      clearInterval(this._listRefreshTimer);
      this._listRefreshTimer = null;
    }
  }

  shutdown() {
    if (this._autoReconnectTimer) clearTimeout(this._autoReconnectTimer);
    this.stopPeriodicListRefresh();
    this.disconnectRole('ap');
    this.disconnectRole('lora_terminal');
  }

  getStatus() {
    return {
      apConnected: this.ports.ap.connected,
      loraTermConnected: this.ports.lora_terminal.connected,
      apPath: this.ports.ap.path,
      loraTermPath: this.ports.lora_terminal.path,
    };
  }
}

module.exports = { SerialManager };
