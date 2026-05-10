/**
 * Drone Connection Manager
 * Handles WebSocket connection to Serial/UDP bridge server
 */

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
    this._seq = 0;
  }

  connect(onTelemetry, onStatus, onDroneList) {
    this.onTelemetryCallback = onTelemetry;
    this.onStatusCallback = onStatus;
    this.onDroneListCallback = onDroneList;

    try {
      this.ws = new WebSocket('ws://localhost:3001');

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
          console.log('Received:', message);

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
          } else if (message.type === 'connected' || message.type === 'ap_connected' || message.type === 'ap_disconnected') {
            this.apConnected = message.apConnected || message.type === 'ap_connected';
            if (this.onStatusCallback) {
              this.onStatusCallback(message);
            }
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
          console.log(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(onTelemetry, onStatus, onDroneList), this.reconnectDelay);
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
      console.error('Not connected to bridge server');
      return Promise.reject(new Error('Not connected to bridge server'));
    }
    return this.send(null, null, { command: 'discover' });
  }

  /**
   * Send mission keyframes to drone
   */
  sendMission(droneIP, keyframes) {
    if (!this.isConnected || !this.ws) {
      return Promise.reject(new Error('Not connected to bridge server'));
    }

    const missionData = keyframes.map(kf => ({
      t: kf.time,
      x: kf.x,
      y: kf.y,
      z: kf.z,
    }));

    const payload = {
      cmd: 'mission',
      seq: ++this._seq,
      data: missionData,
    };

    return this.send(droneIP, payload);
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

  /**
   * Send command to drone via bridge
   */
  send(droneIP, payload, directCommand = null) {
    if (!this.isConnected || !this.ws) {
      return Promise.reject(new Error('Not connected to bridge server'));
    }

    return new Promise((resolve, reject) => {
      const message = directCommand || {
        droneIP,
        payload,
      };

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
