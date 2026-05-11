import React, { createContext, useContext, useState } from 'react';

// ── Translations ──────────────────────────────────────────────
const translations = {
  de: {
    // App / Navigation
    appTitle: 'Multi-Drone Mission Planner',
    tab3d: '3D Show Planner',
    tabGps: 'GPS Karte & Geofence',

    // DronePanel
    drones: 'Drohnen',
    search: 'Suchen',
    addDronePlaceholder: 'Drohne manuell hinzufügen',
    namePlaceholder: 'Name (z.B. Drohne-04)',
    ipPlaceholder: 'IP-Adresse (z.B. 192.168.1.104)',
    add: 'Hinzufügen',
    cancel: 'Abbrechen',
    noDrones: 'Keine Drohnen. Suchen oder manuell hinzufügen.',
    pos: 'Pos',
    keyframe: 'KF',
    upload: 'Upload',
    start: 'Start',
    stop: 'Stop',
    land: 'Landen',
    emergencyStop: 'Not-Aus',
    armed: 'SCHARF',
    disarmed: 'INAKTIV',
    modeDisarmed: 'Deaktiviert',
    modeStabilize: 'Stabilize',
    modeMission: 'Mission',
    modeRth: 'RTH',
    modeLand: 'Landen',
    preflightOk: 'Vorflugcheck OK',
    preflightFail: 'Vorflugcheck',
    bridgeOk: 'Bridge OK',
    bridgeNo: 'Keine Bridge',
    waypoint: 'WP',

    // KeyframeEditor
    keyframes: 'Keyframes',
    time: 'Zeit',
    height: 'Z (Höhe)',
    led: 'LED',
    colorFunction: 'Funktion',
    fnSolid: 'Dauerlicht',
    fnPulse: 'Puls',
    fnStrobe: 'Blitz',
    periodMs: 'Periode ms',
    intervalMs: 'Interval ms',
    noKeyframes: 'Keine Keyframes',

    // MissionExport
    missionExport: 'Mission Export (SD-Karte)',
    speedWarning: 'Geschwindigkeits-Warnung',
    drone: 'Drohne',
    selectDrone: '-- wählen --',
    keyframesCount: 'Keyframes',
    duration: 'Dauer',
    waypointsCount: 'Wegpunkte (0.5s)',
    startPoint: 'Start',
    emergency: 'Notfall',
    geofence: 'Geofence',
    notSet: 'nicht gesetzt',
    downloadJson: 'JSON für SD-Karte herunterladen',
    readyForSd: 'bereit für SD-Karte',
    speedAt: 'zwischen',

    // BlackboxViewer
    blackboxViewer: 'Blackbox Viewer',
    loadFile: 'CSV laden',
    noFile: 'Keine Datei geladen. CSV-Datei von der SD-Karte auswählen.',
    records: 'Datensätze',
    maxAgl: 'Max. Höhe',
    minPres: 'Min. Druck',
    maxPres: 'Max. Druck',
    chartAgl: 'Höhe AGL (m)',
    chartMotors: 'Motoren (µs)',
    chartAttitude: 'Lage (°)',
    timeS: 'Zeit (s)',

    // Timeline / Toolbar
    play: 'Abspielen',
    pause: 'Pause',
    maxTime: 'Max. Zeit',
    save: 'Speichern',
    load: 'Laden',
    model3d: '3D Modell',
    circle: 'Kreis',
    line: 'Linie',
    startPositions: 'Startpositionen',
    timesync: 'Zeitsync',
    interpolation: 'Interpolation',

    // EventLog
    eventLog: 'Ereignisprotokoll',

    // HeightProfile
    heightProfile: 'Höhenprofil',

    // GPSMissionPlanner
    gpsPlanner: 'GPS Missionsplaner',

    // COM Ports / LoRa Terminal / Funke
    tabCom: 'COM & Funke',
    loraTerminal: 'LoRa Terminal',
    funkeControl: 'Funke / RC Controller',
    portConnect: 'Verbinden',
    portDisconnect: 'Trennen',
    portRefresh: 'Aktualisieren',
    noGamepad: 'Kein Gamepad erkannt',
    gamepadDetected: 'Gamepad erkannt',
    autoForward: 'Auto-Weiterleiten',
    targetDrone: 'Ziel-Drohne',
    clearTerminal: 'Terminal löschen',
    autoScroll: 'Auto-Scroll',
    rcChannels: 'RC Kanäle',
    noDroneSelected: '-- Keine Drohne --',
  },

  en: {
    // App / Navigation
    appTitle: 'Multi-Drone Mission Planner',
    tab3d: '3D Show Planner',
    tabGps: 'GPS Map & Geofence',

    // DronePanel
    drones: 'Drones',
    search: 'Search',
    addDronePlaceholder: 'Add drone manually',
    namePlaceholder: 'Name (e.g. Drone-04)',
    ipPlaceholder: 'IP address (e.g. 192.168.1.104)',
    add: 'Add',
    cancel: 'Cancel',
    noDrones: 'No drones. Search or add manually.',
    pos: 'Pos',
    keyframe: 'KF',
    upload: 'Upload',
    start: 'Start',
    stop: 'Stop',
    land: 'Land',
    emergencyStop: 'E-Stop',
    armed: 'ARMED',
    disarmed: 'DISARMED',
    modeDisarmed: 'Disarmed',
    modeStabilize: 'Stabilize',
    modeMission: 'Mission',
    modeRth: 'RTH',
    modeLand: 'Landing',
    preflightOk: 'Pre-flight OK',
    preflightFail: 'Pre-flight',
    bridgeOk: 'Bridge OK',
    bridgeNo: 'No Bridge',
    waypoint: 'WP',

    // KeyframeEditor
    keyframes: 'Keyframes',
    time: 'Time',
    height: 'Z (Height)',
    led: 'LED',
    colorFunction: 'Function',
    fnSolid: 'Solid',
    fnPulse: 'Pulse',
    fnStrobe: 'Strobe',
    periodMs: 'Period ms',
    intervalMs: 'Interval ms',
    noKeyframes: 'No keyframes',

    // MissionExport
    missionExport: 'Mission Export (SD Card)',
    speedWarning: 'Speed Warning',
    drone: 'Drone',
    selectDrone: '-- select --',
    keyframesCount: 'Keyframes',
    duration: 'Duration',
    waypointsCount: 'Waypoints (0.5s)',
    startPoint: 'Home',
    emergency: 'Emergency',
    geofence: 'Geofence',
    notSet: 'not set',
    downloadJson: 'Download JSON for SD card',
    readyForSd: 'ready for SD card',
    speedAt: 'between',

    // BlackboxViewer
    blackboxViewer: 'Blackbox Viewer',
    loadFile: 'Load CSV',
    noFile: 'No file loaded. Select a CSV file from the SD card.',
    records: 'Records',
    maxAgl: 'Max altitude',
    minPres: 'Min pressure',
    maxPres: 'Max pressure',
    chartAgl: 'Altitude AGL (m)',
    chartMotors: 'Motors (µs)',
    chartAttitude: 'Attitude (°)',
    timeS: 'Time (s)',

    // Timeline / Toolbar
    play: 'Play',
    pause: 'Pause',
    maxTime: 'Max time',
    save: 'Save',
    load: 'Load',
    model3d: '3D Model',
    circle: 'Circle',
    line: 'Line',
    startPositions: 'Start positions',
    timesync: 'Time sync',
    interpolation: 'Interpolation',

    // EventLog
    eventLog: 'Event log',

    // HeightProfile
    heightProfile: 'Height profile',

    // GPSMissionPlanner
    gpsPlanner: 'GPS Mission Planner',

    // COM Ports / LoRa Terminal / Funke
    tabCom: 'COM & RC',
    loraTerminal: 'LoRa Terminal',
    funkeControl: 'RC Controller',
    portConnect: 'Connect',
    portDisconnect: 'Disconnect',
    portRefresh: 'Refresh',
    noGamepad: 'No gamepad detected',
    gamepadDetected: 'Gamepad detected',
    autoForward: 'Auto-forward',
    targetDrone: 'Target drone',
    clearTerminal: 'Clear terminal',
    autoScroll: 'Auto-scroll',
    rcChannels: 'RC Channels',
    noDroneSelected: '-- No drone --',
  },
};

// ── Context ───────────────────────────────────────────────────
const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const saved = typeof localStorage !== 'undefined'
    ? (localStorage.getItem('lang') || 'de')
    : 'de';
  const [lang, setLangState] = useState(saved);

  const setLang = (l) => {
    setLangState(l);
    localStorage.setItem('lang', l);
  };

  const t = (key) => translations[lang]?.[key] ?? translations.de[key] ?? key;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
