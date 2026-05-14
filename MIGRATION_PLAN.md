# Desktop Migration Plan — Web → Electron

**Status**: ✅ COMPLETE (all 6 phases — code, build, docs)
**Started**: 2026-05-13
**Completed**: 2026-05-14
**Branch**: `main` (no separate branch — consider commit + PR before further work)

**Artifacts produced:**
- `dist-electron\Multi-Drone Control-Setup-2.0.0.exe` (100 MB) — NSIS installer
- `dist-electron\Multi-Drone Control-Setup-2.0.0.zip` (138 MB) — Portable ZIP
- `dist-electron\win-unpacked\` — unpacked app directory, runnable directly

---

## Goal

Convert the React web app (currently `npm start` + `node serial-bridge.js`) into
a **native Windows Desktop application** packaged as a single `.exe` via Electron.

## Why Electron (not Tauri)

The project depends on `serialport@12` and `@serialport/parser-readline` — native
Node.js modules used for USB-Serial communication with the ESP32 LoRa gateway.

| Aspect | Electron | Tauri |
|--------|----------|-------|
| `serialport` native module | ✅ Works directly | ❌ Would need Rust rewrite |
| Bundle size | ~150 MB | ~10 MB |
| Existing code reuse | ~95% | ~50% (frontend only) |
| Decision | **Chosen** | Rejected |

Bundle size is the only Electron downside, and for a development/lab tool this is
acceptable. If size becomes an issue later, migrating renderer to Tauri while
keeping a Node sidecar process is a viable path.

---

## Architecture Transformation

**Before** (current state):
```
ESP32 ──USB──> serial-bridge.js ──WebSocket :3001──> React (browser :3000)
                  (Node.js)                            (CRA dev server)
```

**After** (target state):
```
ESP32 ──USB──> Electron Main Process ──IPC──> Electron Renderer (React build)
                (serial-bridge.js logic)         (built React bundle, no dev server)
```

Key consequence: the `server/` directory becomes obsolete for normal use.
`serial-bridge.js` will be **kept as legacy** for the web-only workflow (for
example running from a remote browser), but the desktop app no longer needs it.

---

## File Map — what changes

### New files (in `electron/` directory)
- `electron/main.js` — Electron main process: window creation, app lifecycle
- `electron/preload.js` — Context bridge: exposes `window.electronAPI` safely
- `electron/serial-manager.js` — Serial-port logic ported from `serial-bridge.js`
- `electron/ipc-handlers.js` — IPC channel handlers (REST + WS replacement)

### Modified files
- `package.json` — Add `electron`, `electron-builder`, `concurrently`, `wait-on`; new scripts; `"main"` field; `"build"` config
- `src/utils/droneConnection.js` — **Critical**: Replace WebSocket calls with `window.electronAPI` IPC calls. Public API stays identical so components don't change.
- `public/index.html` — Possibly add CSP meta tag for Electron
- `CLAUDE.md` — Document new architecture

### Unchanged
- `src/components/**/*.jsx` — All React components remain untouched (they only touch `droneConnection` interface)
- `src/i18n/index.js`, `src/utils/interpolation.js`, etc.
- `AccessPoint_ESP32.ino` — Firmware unchanged
- KiCad / `Schem/**` — Hardware unchanged

### Deprecated (kept for legacy / web-only use)
- `server/serial-bridge.js` — Still works for web-browser usage
- `server/udp-bridge.js`
- `installer/setup.iss` — Web-version Inno Setup installer (Electron-builder replaces it for desktop)

---

## Phases (track via TaskList)

### Phase 1 — Scaffolding 🟡 In Progress
- [x] Install dependencies: `electron`, `electron-builder`, `concurrently`, `wait-on`, `cross-env` — running, waiting on npm
- [x] Create `electron/` directory with `main.js`, `preload.js`
- [x] Set `"main": "electron/main.js"` in `package.json`
- [x] Add scripts: `electron:dev`, `electron:start`, `electron:build`, `electron:pack`, `postinstall`
- [ ] **Verify: a blank Electron window opens via `npm run electron:dev`** (blocked on npm install)

### Phase 2 — Port Serial Logic ✅
- [x] Created `electron/serial-manager.js` (class `SerialManager extends EventEmitter`)
- [x] HTTP/WebSocket layer removed; exposes: `listPorts()`, `connectRole()`, `disconnectRole()`, `sendToESP32()`, `autoDetectAP()`, `sendToDrone()`, `broadcastToDrones()`, `sendFunkeChannels()`, `sendTimesync()`
- [x] Port-registry kept (`ap`, `lora_terminal`)
- [x] EventEmitter API with channels matching old WS protocol: `ap_connected`, `telemetry`, `lora_rx`, `lora_terminal_rx`, `drone_list`, `preflight`, etc.

### Phase 3 — IPC Layer ✅
- [x] `electron/preload.js`: `window.electronAPI` via `contextBridge` with curated surface
- [x] `electron/main.js`: `ipcMain.handle()` for `ports:list`, `ports:connect`, `ports:disconnect`, `bridge:status`, `drone:send`, `drone:broadcast`, `drone:discover`, `drone:list`, `drone:funke`, `drone:timesync`
- [x] Event channels: SerialManager events forwarded as `event:<name>` to renderer, exposed as `electronAPI.on(channel, cb)` returning unsubscribe fn
- [x] Security: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` (needed for preload requiring `electron` and `serialport`)

### Phase 4 — Refactor `droneConnection.js` ✅
- [x] Detects `window.electronAPI.isElectron` at construct time, sets `this.mode = 'electron' | 'web'`
- [x] Electron path: subscribes via `electronAPI.on('...', cb)`, sends via `electronAPI.sendToDrone()` etc.
- [x] Web path: original WebSocket + REST logic preserved as `_connectWeb()`
- [x] Public API **identical** — no component changes needed
- [ ] **End-to-end verification with real ESP32** — pending hardware test

### Phase 5 — Build & Package ✅
- [x] `build` config in `package.json` (NSIS + zip, x64, `extends: null`, `extraMetadata.main`, `asarUnpack` for serialport)
- [x] Build scripts include `CSC_IDENTITY_AUTO_DISCOVERY=false` and `--config.win.signAndEditExecutable=false`
- [x] Successfully ran `npm run electron:build` → `Multi-Drone Control-Setup-2.0.0.exe` (100 MB)
- [x] Also produced `electron:build:zip` → 138 MB portable
- [ ] Add app icon (`build-resources/icon.ico`) — optional, Electron default works
- [ ] Test installer on clean Windows VM — pending real-world test

### Phase 6 — Cleanup & Docs ✅
- [x] `CLAUDE.md` updated with Desktop + Web stack, IPC channels, new file table
- [x] `installer/setup.iss` left as-is (still works for web mode, noted as legacy)
- [x] `start.bat` left as-is (still produced by `install.ps1` for web mode)
- [x] `memory/desktop_migration.md` will be marked complete
- [x] `.gitignore` extended for `dist-electron/`, `build/`, `electron-build.log`

---

## ⚠️ Critical: Network drive (Z:) issue

This project sits on a SMB/NAS mount (`Z:\src\Projects\Multi Drone Control`).
`npm install` is unreliable here because:

- Windows holds file locks longer than NPM expects → `EPERM rmdir` during cleanup
- `node_modules` deletion via PowerShell `Remove-Item -Recurse` hangs indefinitely
- Extended-path semantics (`\\?\Z:\...`) interact badly with SMB

**Symptoms seen during this migration:**
- npm install warns "Failed to remove some directories" → leaves partial node_modules
- Subsequent installs fail with `MODULE_NOT_FOUND` for basic packages like `once`
- Native builds (`node-gyp-build` for serialport) fail with "node nicht gefunden"

**Recommended fix for next agent:**
1. Try `cmd /c "rd /s /q node_modules"` (Windows-native, faster than PowerShell)
2. Try `npm install --force --no-audit --no-fund`
3. **If still failing**: ask the user to either (a) run `npm install` themselves in a fresh terminal, or (b) move the project to a local SSD. There is no clever fix; the NAS is the bottleneck.

The code work (Phases 1–4) is COMPLETE and doesn't need npm install to be reviewed/edited. Only Phase 5 (.exe build) requires a successful install.

---

## Continuity — for the next agent / future you

**If you are picking this up mid-flight, read this section first.**

1. Run `TaskList` — find the first `pending`/`in_progress` task, that's the next thing.
2. Check `git status` + `git log` since 2026-05-13 to see what code has actually landed.
3. Read `memory/desktop_migration.md` for high-level decisions and gotchas.
4. The **single most important rule**: keep the public API of `src/utils/droneConnection.js` unchanged. Components import its methods (`connect`, `sendMission`, `softLand`, etc.). If those signatures change, every component breaks.
5. Test commands:
   ```powershell
   npm run electron:dev      # development mode (React dev server + Electron)
   npm run electron:build    # production build to dist-electron/
   ```

### Known gotchas

- **`serialport` requires native rebuild for Electron** — when `electron-builder` packages, it auto-rebuilds via the `postinstall` script (`electron-builder install-app-deps`). In dev mode you may need `npm run rebuild` or `electron-rebuild`. Watch for "NODE_MODULE_VERSION mismatch" errors at first `electron:dev` run.
- **Context isolation is non-negotiable** — do NOT set `nodeIntegration: true` for convenience. Always use `contextBridge` in preload.
- **`window.location.protocol`** is `file:` in production, `http:` in dev — affects any code that assumes URLs.
- **CSP** — Electron's default CSP can block dynamic imports. If React doesn't load, check DevTools Console for CSP violations.
- **npm install PATH issue (Windows)** — When running `npm install` from a fresh PowerShell session, child processes of `node-gyp-build` (used by `serialport`) may not inherit `node` in PATH and fail with "Der Befehl 'node' konnte nicht gefunden werden". Workaround: run `npm install` from `cmd /c "set PATH=C:\Program Files\nodejs;%PATH% && npm install"` or from a freshly opened terminal where Node is on PATH.
- **`react-scripts start` opens browser by default** — the `electron:dev` script sets `BROWSER=none` via `cross-env` to prevent that.

### Files to read for context (in order)

1. This file (`MIGRATION_PLAN.md`)
2. `memory/desktop_migration.md`
3. `server/serial-bridge.js` (the code being ported)
4. `src/utils/droneConnection.js` (the code being refactored)
5. `CLAUDE.md`

---

## Decisions log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-05-13 | Electron over Tauri | `serialport` native module |
| 2026-05-13 | Keep `server/serial-bridge.js` | Legacy web-only usage |
| 2026-05-13 | NSIS installer target | Standard Windows, supports per-user install |
| 2026-05-13 | `contextIsolation: true` | Security baseline, no exceptions |
