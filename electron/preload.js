// Electron Preload Script
//
// Exposes a curated API surface on window.electronAPI that mirrors what the
// old WebSocket bridge offered. The renderer uses ONLY this API — no Node
// access. contextIsolation:true is enforced in main.js webPreferences.

const { contextBridge, ipcRenderer } = require('electron');

// One-way event channels (main → renderer)
const EVENT_CHANNELS = [
  'ap_connected',
  'ap_disconnected',
  'telemetry',
  'lora_rx',
  'lora_terminal_rx',
  'lora_terminal_disconnected',
  'drone_connected',
  'drone_disconnected',
  'drone_list',
  'preflight',
  'error',
];

const listeners = new Map(); // channel → Set<callback>

// Register IPC listeners lazily (once per channel)
function ensureChannelListener(channel) {
  if (listeners.has(channel)) return;
  const set = new Set();
  listeners.set(channel, set);
  ipcRenderer.on(`event:${channel}`, (_e, payload) => {
    for (const cb of set) {
      try { cb(payload); } catch (err) { console.error(`[electronAPI] ${channel} cb error:`, err); }
    }
  });
}

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,

  // ─── REST-equivalent (invoke / returns a promise) ────────────────────────
  listPorts:        ()                        => ipcRenderer.invoke('ports:list'),
  connectPort:      (role, path, baudRate)    => ipcRenderer.invoke('ports:connect', { role, path, baudRate }),
  disconnectPort:   (role)                    => ipcRenderer.invoke('ports:disconnect', { role }),
  getBridgeStatus:  ()                        => ipcRenderer.invoke('bridge:status'),

  // ─── Commands to drones ──────────────────────────────────────────────────
  sendToDrone:      (droneIP, payload)        => ipcRenderer.invoke('drone:send', { droneIP, payload }),
  broadcast:        (payload)                 => ipcRenderer.invoke('drone:broadcast', { payload }),
  discoverDrones:   ()                        => ipcRenderer.invoke('drone:discover'),
  refreshDroneList: ()                        => ipcRenderer.invoke('drone:list'),
  sendFunke:        (droneId, channels)       => ipcRenderer.invoke('drone:funke', { droneId, channels }),
  sendTimesync:     ()                        => ipcRenderer.invoke('drone:timesync'),

  // ─── Event subscription (returns unsubscribe fn) ─────────────────────────
  on(channel, callback) {
    if (!EVENT_CHANNELS.includes(channel)) {
      console.warn(`[electronAPI] unknown channel: ${channel}`);
      return () => {};
    }
    ensureChannelListener(channel);
    listeners.get(channel).add(callback);
    return () => listeners.get(channel).delete(callback);
  },
});
