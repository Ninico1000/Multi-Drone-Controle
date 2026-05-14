// Electron Main Process — Multi-Drone Control
//
// Owns:
//   - BrowserWindow lifecycle
//   - SerialManager instance (port discovery, AP + LoRa terminal)
//   - IPC handlers that forward renderer requests to SerialManager
//   - Event forwarding from SerialManager → all renderer windows

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { SerialManager } = require('./serial-manager');

const isDev = !app.isPackaged;

// ─── State ────────────────────────────────────────────────────────────────────
let mainWindow = null;
const serial = new SerialManager();

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: '#1a1a1a',
    title: 'Multi-Drone Control',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'build', 'index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── Forward SerialManager events to the renderer ────────────────────────────
const FORWARDED_EVENTS = [
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

for (const evt of FORWARDED_EVENTS) {
  serial.on(evt, (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`event:${evt}`, payload);
    }
  });
}

// ─── IPC: invoke handlers (renderer → main, returns a value) ─────────────────
ipcMain.handle('ports:list', async () => {
  return serial.listPorts();
});

ipcMain.handle('ports:connect', async (_e, { role, path: portPath, baudRate }) => {
  await serial.connectRole(role, portPath, baudRate);
  return { ok: true, role, path: portPath };
});

ipcMain.handle('ports:disconnect', async (_e, { role }) => {
  serial.disconnectRole(role);
  return { ok: true, role };
});

ipcMain.handle('bridge:status', async () => {
  return serial.getStatus();
});

ipcMain.handle('drone:send', async (_e, { droneIP, payload }) => {
  return serial.sendToDrone(droneIP, payload);
});

ipcMain.handle('drone:broadcast', async (_e, { payload }) => {
  return serial.broadcastToDrones(payload);
});

ipcMain.handle('drone:discover', async () => {
  return serial.triggerDiscover();
});

ipcMain.handle('drone:list', async () => {
  return serial.requestDroneList();
});

ipcMain.handle('drone:funke', async (_e, { droneId, channels }) => {
  return serial.sendFunkeChannels(droneId, channels);
});

ipcMain.handle('drone:timesync', async () => {
  return serial.sendTimesync();
});

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  // Auto-detect ESP32 AP once the window exists
  serial.autoDetectAP();
  serial.startPeriodicListRefresh();
});

app.on('window-all-closed', () => {
  serial.shutdown();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  serial.shutdown();
});
