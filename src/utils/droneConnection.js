/**
 * Drone Connection Manager
 * Handles WebSocket connection to Serial/UDP bridge server
 */

const BRIDGE_URL = 'ws://localhost:3001';
const REST_BASE  = 'http://localhost:3001';

class DroneConnection {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.apConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;
    this.onTelemetryCallback = null;
    this.onStatusCallback = null;
    this.onDroneListCallback = null;
    // New optional callbacks
    this.onLoraTerminalLine = null;
    this.onPortStatusChange = null;
    this._seq = 0;
  }

  /**
   * @param {Function} onTelemetry  (droneIP, data, droneIdHint?) => void
   * @param {Function} onStatus     (statusObj) => void
   * @param {Function} onDroneList  (drones[]) => void
   * @param {Object}   [opts]
   * @param {Function} [opts.onLoraTerminalLine]  (rawLine, ts) => void
   * @param {Function} [opts.onPortStatusChange]  (role, connected, path) => void
   */
  connect(onTelemetry, onStatus, onDroneList, opts = {}) {
    this.onTelemetryCallback = onTelemetry;
    this.onStatusCallback = onStatus;
    this.onDroneListCallback = onDroneList;
    this.onLoraTerminalLine = opts.onLoraTerminalLine || null;
    this.onPortStatusChange = opts.onPortStatusChange || null;

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
            if (data && data.id != null) {
              this.onTelemetryCallback(null, data, data.id);
            }

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

          // ── LoRa Terminal ────────────────────────────────────────────────
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
          console.log(`Reconnecting… (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(
            () => this.connect(onTelemetry, onStatus, onDroneList, opts),
            this.reconnectDelay
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

  disconnect() {
    if (this.ws) {
      this.reconnectAttempts = this.maxReconnectAttempts;
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  discoverDrones() {
    if (!this.isConnected || !this.ws) {
      return Promise.reject(new Error('Not connected to bridge server'));
    }
    return this.send(null, null, { command: 'discover' });
  }

  sendMission(droneIP, keyframes) {
    if (!this.isConnected || !this.ws) {
      return Promise.reject(new Error('Not connected to bridge server'));
    }
    const missionData = keyframes.map(kf => ({ t: kf.time, x: kf.x, y: kf.y, z: kf.z }));
    return this.send(droneIP, { cmd: 'mission', seq: ++this._seq, data: missionData });
  }

  startMission(droneIP) {
    return this.send(droneIP, { cmd: 'start', seq: ++this._seq });
  }

  stopMission(droneIP) {
    return this.send(droneIP, { cmd: 'stop', seq: ++this._seq });
  }

  emergencyStop(droneIP) {
    return this.send(droneIP, { cmd: 'emergency', seq: ++this._seq });
  }

  softLand(droneIP) {
    return this.send(droneIP, { cmd: 'land', seq: ++this._seq });
  }

  sendTimesync() {
    return this.send(null, null, { cmd: 'timesync' });
  }

  // ── Funke: forward RC channels to a specific drone ────────────────────────
  sendFunkeToDrone(droneId, channels) {
    return this.send(null, null, { command: 'funke_to_drone', droneId, channels });
  }

  // ── REST helpers for port management ─────────────────────────────────────
  async listPorts() {
    const res = await fetch(`${REST_BASE}/api/ports`);
    if (!res.ok) throw new Error('Failed to list ports');
    return res.json();
  }

  async connectPort(role, path, baudRate = 115200) {
    const res = await fetch(`${REST_BASE}/api/ports/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, path, baudRate }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to connect port');
    }
    return res.json();
  }

  async disconnectPort(role) {
    const res = await fetch(`${REST_BASE}/api/ports/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to disconnect port');
    }
    return res.json();
  }

  // ── Generic send ──────────────────────────────────────────────────────────
  send(droneIP, payload, directCommand = null) {
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
