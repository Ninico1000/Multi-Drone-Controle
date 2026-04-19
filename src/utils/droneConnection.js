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
          } else if (message.type === 'drone_list' && this.onDroneListCallback) {
            this.onDroneListCallback(message.drones);
          } else if (message.type === 'drone_connected' && this.onDroneListCallback) {
            // Trigger list refresh
            this.discoverDrones();
          } else if (message.type === 'drone_disconnected' && this.onDroneListCallback) {
            // Trigger list refresh
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

        // Attempt reconnection
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
      this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  /**
   * Discover drones connected to the Access Point
   */
  discoverDrones() {
    if (!this.isConnected || !this.ws) {
      console.error('Not connected to bridge server');
      return Promise.reject(new Error('Not connected to bridge server'));
    }

    return this.send(null, null, { command: 'discover' });
  }

  /**
   * Send mission keyframes to drone
   * @param {string} droneIP - IP address of the drone
   * @param {Array} keyframes - Array of keyframe objects
   */
  sendMission(droneIP, keyframes) {
    if (!this.isConnected || !this.ws) {
      console.error('Not connected to bridge server');
      return Promise.reject(new Error('Not connected to bridge server'));
    }

    // Format keyframes for ESP32 (match expected JSON format)
    const missionData = keyframes.map(kf => ({
      t: kf.time,
      x: kf.x,
      y: kf.y,
      z: kf.z,
      yaw: kf.yaw,
      pitch: kf.pitch,
      roll: kf.roll
    }));

    const payload = {
      cmd: 'mission',
      data: missionData
    };

    return this.send(droneIP, payload);
  }

  /**
   * Start mission on drone
   * @param {string} droneIP - IP address of the drone
   */
  startMission(droneIP) {
    return this.send(droneIP, { cmd: 'start' });
  }

  /**
   * Stop mission on drone
   * @param {string} droneIP - IP address of the drone
   */
  stopMission(droneIP) {
    return this.send(droneIP, { cmd: 'stop' });
  }

  /**
   * Emergency stop
   * @param {string} droneIP - IP address of the drone
   */
  emergencyStop(droneIP) {
    return this.send(droneIP, { cmd: 'emergency' });
  }

  /**
   * Send command to drone via bridge
   * @param {string} droneIP - IP address of the drone (null for broadcast/discovery)
   * @param {Object} payload - Command payload
   * @param {Object} directCommand - Direct command to bridge (for discovery, etc.)
   */
  send(droneIP, payload, directCommand = null) {
    if (!this.isConnected || !this.ws) {
      return Promise.reject(new Error('Not connected to bridge server'));
    }

    return new Promise((resolve, reject) => {
      const message = directCommand || {
        droneIP,
        payload
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

// Export singleton instance
export default new DroneConnection();
