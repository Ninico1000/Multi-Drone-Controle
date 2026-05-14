// DroneConnection — singleton client used by every React component.
//
// Public API is STABLE — do not change method signatures. The class
// transparently uses Electron IPC (window.electronAPI) when available
// and falls back to the old WebSocket+REST bridge for plain browser use.
//
// See MIGRATION_PLAN.md → Phase 4 for the rationale.

const BRIDGE_URL = 'ws://localhost:3001';
const REST_BASE  = 'http://localhost:3001';

const isElectron =
  typeof window !== 'undefined' &&
  window.electronAPI &&
  window.electronAPI.isElectron === true;

class DroneConnection {
  constructor() {
    this.mode = null;          // 'electron' | 'web'
    this.ws = null;
    this.isConnected = false;
    this.apConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;
    this.onTelemetryCallback = null;
    this.onStatusCallback = null;
    this.onDroneListCallback = null;
    this.onLoraTerminalLine = null;
    this.onPortStatusChange = null;
    this._seq = 0;
    this._electronUnsubs = [];
  }

  // ─── connect / disconnect ────────────────────────────────────────────────
  connect(onTelemetry, onStatus, onDroneList, opts = {}) {
    this.onTelemetryCallback = onTelemetry;
    this.onStatusCallback = onStatus;
    this.onDroneListCallback = onDroneList;
    this.onLoraTerminalLine = opts.onLoraTerminalLine || null;
    this.onPortStatusChange = opts.onPortStatusChange || null;

    if (isElectron) {
      this.mode = 'electron';
      this._connectElectron();
    } else {
      this.mode = 'web';
      this._connectWeb(onTelemetry, onStatus, onDroneList, opts);
    }
  }

  disconnect() {
    if (this.mode === 'electron') {
      this._electronUnsubs.forEach(unsub => { try { unsub(); } catch {} });
      this._electronUnsubs = [];
      this.isConnected = false;
      return;
    }
    if (this.ws) {
      this.reconnectAttempts = this.maxReconnectAttempts;
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  // ─── Electron implementation ─────────────────────────────────────────────
  _connectElectron() {
    const api = window.electronAPI;
    this.isConnected = true;

    api.getBridgeStatus().then(status => {
      this.apConnected = !!status.apConnected;
      if (this.onStatusCallback) {
        this.onStatusCallback({
          connected: true,
          apConnected: this.apConnected,
          message: this.apConnected ? 'Bridge connected (Desktop)' : 'Waiting for ESP32 AP',
        });
      }
    }).catch(() => {});

    this._electronUnsubs.push(
      api.on('ap_connected', () => {
        this.apConnected = true;
        if (this.onStatusCallback) {
          this.onStatusCallback({ type: 'ap_connected', apConnected: true, message: 'ESP32 AP connected' });
        }
      }),
      api.on('ap_disconnected', () => {
        this.apConnected = false;
        if (this.onStatusCallback) {
          this.onStatusCallback({ type: 'ap_disconnected', apConnected: false, message: 'ESP32 AP disconnected' });
        }
      }),
      api.on('telemetry', ({ droneIP, data }) => {
        if (this.onTelemetryCallback) this.onTelemetryCallback(droneIP, data);
      }),
      api.on('lora_rx', ({ data }) => {
        if (this.onTelemetryCallback && data && data.id != null) {
          this.onTelemetryCallback(null, data, data.id);
        }
      }),
      api.on('drone_list', ({ drones }) => {
        if (this.onDroneListCallback) this.onDroneListCallback(drones);
      }),
      api.on('drone_connected', () => {
        if (this.onDroneListCallback) this.discoverDrones();
      }),
      api.on('drone_disconnected', () => {
        if (this.onDroneListCallback) this.discoverDrones();
      }),
      api.on('preflight', (data) => {
        if (this.onStatusCallback) this.onStatusCallback({ type: 'preflight', ...data });
      }),
      api.on('lora_terminal_rx', ({ raw, ts }) => {
        if (this.onLoraTerminalLine) this.onLoraTerminalLine(raw, ts);
      }),
      api.on('lora_terminal_disconnected', ({ path }) => {
        if (this.onPortStatusChange) this.onPortStatusChange('lora_terminal', false, path);
      }),
      api.on('error', ({ message }) => {
        if (this.onStatusCallback) this.onStatusCallback({ type: 'error', message });
      }),
    );
  }

  // ─── Web (WebSocket) implementation — original logic ─────────────────────
  _connectWeb(onTelemetry, onStatus, onDroneList, opts) {
    try {
      this.ws = new WebSocket(BRIDGE_URL);

      this.ws.onopen = () => {
        console.log('Connected to bridge server');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        if (this.onStatusCallback) {
          this.onStatusCallback({ connected: true, message: 'Bridge connected' });
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'telemetry' && this.onTelemetryCallback) {
            this.onTelemetryCallback(message.droneIP, message.data);
          } else if (message.type === 'lora_rx' && this.onTelemetryCallback) {
            const data = message.data;
            if (data && data.id != null) this.onTelemetryCallback(null, data, data.id);
          } else if (message.type === 'preflight' && this.onStatusCallback) {
            this.onStatusCallback({ type: 'preflight', ...message });
          } else if (message.type === 'drone_list' && this.onDroneListCallback) {
            this.onDroneListCallback(message.drones);
          } else if (message.type === 'drone_connected' && this.onDroneListCallback) {
            this.discoverDrones();
          } else if (message.type === 'drone_disconnected' && this.onDroneListCallback) {
            this.discoverDrones();
          } else if (
            message.type === 'connected' ||
            message.type === 'ap_connected' ||
            message.type === 'ap_disconnected'
          ) {
            this.apConnected = message.apConnected || message.type === 'ap_connected';
            if (this.onStatusCallback) this.onStatusCallback(message);
          } else if (message.type === 'lora_terminal_rx') {
            if (this.onLoraTerminalLine) this.onLoraTerminalLine(message.raw, message.ts);
          } else if (message.type === 'lora_terminal_connected') {
            if (this.onPortStatusChange) this.onPortStatusChange('lora_terminal', true, message.path);
          } else if (message.type === 'lora_terminal_disconnected') {
            if (this.onPortStatusChange) this.onPortStatusChange('lora_terminal', false, message.path);
          } else if (this.onStatusCallback) {
            this.onStatusCallback(message);
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('Disconnected from bridge server');
        this.isConnected = false;
        if (this.onStatusCallback) {
          this.onStatusCallback({ connected: false, message: 'Bridge disconnected' });
        }
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(
            () => this._connectWeb(onTelemetry, onStatus, onDroneList, opts),
            this.reconnectDelay,
          );
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (this.onStatusCallback) {
          this.onStatusCallback({ connected: false, message: 'Connection error', error });
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      if (this.onStatusCallback) {
        this.onStatusCallback({ connected: false, message: 'Failed to connect', error });
      }
    }
  }

  // ─── Public command API — same signatures in both modes ──────────────────
  discoverDrones() {
    if (this.mode === 'electron') return window.electronAPI.discoverDrones();
    return this.send(null, null, { command: 'discover' });
  }

  sendMission(droneIP, keyframes) {
    const missionData = keyframes.map(kf => ({ t: kf.time, x: kf.x, y: kf.y, z: kf.z }));
    return this.send(droneIP, { cmd: 'mission', seq: ++this._seq, data: missionData });
  }

  startMission(droneIP)  { return this.send(droneIP, { cmd: 'start',     seq: ++this._seq }); }
  stopMission(droneIP)   { return this.send(droneIP, { cmd: 'stop',      seq: ++this._seq }); }
  emergencyStop(droneIP) { return this.send(droneIP, { cmd: 'emergency', seq: ++this._seq }); }
  softLand(droneIP)      { return this.send(droneIP, { cmd: 'land',      seq: ++this._seq }); }

  sendTimesync() {
    if (this.mode === 'electron') return window.electronAPI.sendTimesync();
    return this.send(null, null, { cmd: 'timesync' });
  }

  sendFunkeToDrone(droneId, channels) {
    if (this.mode === 'electron') return window.electronAPI.sendFunke(droneId, channels);
    return this.send(null, null, { command: 'funke_to_drone', droneId, channels });
  }

  async listPorts() {
    if (this.mode === 'electron') return window.electronAPI.listPorts();
    const res = await fetch(`${REST_BASE}/api/ports`);
    if (!res.ok) throw new Error('Failed to list ports');
    return res.json();
  }

  async connectPort(role, path, baudRate = 115200) {
    if (this.mode === 'electron') return window.electronAPI.connectPort(role, path, baudRate);
    return this._postJson('/api/ports/connect', { role, path, baudRate });
  }

  async disconnectPort(role) {
    if (this.mode === 'electron') return window.electronAPI.disconnectPort(role);
    return this._postJson('/api/ports/disconnect', { role });
  }

  async _postJson(endpoint, body) {
    const res = await fetch(`${REST_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  }

  // ─── Low-level send ──────────────────────────────────────────────────────
  send(droneIP, payload, directCommand = null) {
    if (this.mode === 'electron') {
      const api = window.electronAPI;
      // Map directCommand back to specific IPC channels
      if (directCommand) {
        if (directCommand.command === 'discover')        return api.discoverDrones();
        if (directCommand.cmd     === 'timesync')        return api.sendTimesync();
        if (directCommand.command === 'funke_to_drone')  return api.sendFunke(directCommand.droneId, directCommand.channels);
        if (directCommand.command === 'broadcast' && directCommand.payload) {
          return api.broadcast(directCommand.payload);
        }
        console.warn('[droneConnection] unmapped directCommand:', directCommand);
        return Promise.resolve();
      }
      return api.sendToDrone(droneIP, payload);
    }

    // Web mode
    if (!this.isConnected || !this.ws) {
      return Promise.reject(new Error('Not connected to bridge server'));
    }
    return new Promise((resolve, reject) => {
      const message = directCommand || { droneIP, payload };
      try {
        this.ws.send(JSON.stringify(message));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }
}

export default new DroneConnection();
