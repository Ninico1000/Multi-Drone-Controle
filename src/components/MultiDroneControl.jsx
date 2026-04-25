import React, { useState, useEffect, useRef } from 'react';
import { Upload, Download, Play, Square, AlertCircle, Box, MapPin, Map, RefreshCw } from 'lucide-react';
import { useLanguage } from '../i18n';
import * as THREE from 'three';
import ThreeScene from './ThreeScene';
import DronePanel from './DronePanel';
import GPSMissionPlanner from './GPSMissionPlanner';
import KeyframeEditor from './KeyframeEditor';
import Timeline from './Timeline';
import EventLog from './EventLog';
import ModelControls from './ModelControls';
import MissionExport from './MissionExport';
import HeightProfile from './HeightProfile';
import BlackboxViewer from './BlackboxViewer';
import { INITIAL_DRONES, DRONE_COLORS } from '../constants/defaults';
import { interpolate, createFormationPositions } from '../utils/interpolation';
import { saveMission, loadMission, load3DModel } from '../utils/fileOperations';
import { assignVerticesToDrones } from '../utils/modelUtils';
import droneConnection from '../utils/droneConnection';

const MultiDroneControl = () => {
  const { lang, setLang, t } = useLanguage();
  const [drones, setDrones] = useState([]);
  const [keyframes, setKeyframes] = useState([]);
  const [selectedKeyframe, setSelectedKeyframe] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [maxTimeSetting, setMaxTimeSetting] = useState(60);
  const [log, setLog] = useState([]);
  const [interpolationMode, setInterpolationMode] = useState('smooth');
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('3d');
  const [telemetry, setTelemetry] = useState({});
  const [preflight, setPreflight] = useState({});
  const [gpsSettings, setGpsSettings] = useState({
    homePoint: null,
    emergencyPoint: null,
    geofenceCenter: null,
    geofenceRadius: 200,
  });

  // 3D Model state
  const [loadedModel, setLoadedModel] = useState(null);
  const [modelVertices, setModelVertices] = useState([]);
  const [selectedVertices, setSelectedVertices] = useState([]);
  const [modelScale, setModelScale] = useState(1);
  const [modelPosition, setModelPosition] = useState({ x: 0, y: 0, z: 2 });
  const [showModel, setShowModel] = useState(true);
  const [modelFileName, setModelFileName] = useState('');
  const [modelGizmoEnabled, setModelGizmoEnabled] = useState(false);

  const droneModelsRef = useRef([]);
  const playbackIntervalRef = useRef(null);

  useEffect(() => {
    setDrones(INITIAL_DRONES);
    addLog('System initialisiert — Koordinatenbasierte Drohnensteuerung');

    const handleTelemetry = (droneIP, telemetryData, droneIdHint) => {
      const idFromData = droneIdHint ?? telemetryData?.id ?? null;
      setDrones(prev => prev.map(d => {
        const match = idFromData != null ? d.id === idFromData : d.ip === droneIP;
        if (match) {
          return {
            ...d,
            x: telemetryData.x ?? d.x,
            y: telemetryData.y ?? d.y,
            z: telemetryData.z ?? d.z,
            yaw: telemetryData.yaw ?? d.yaw,
            pitch: telemetryData.pitch ?? d.pitch,
            roll: telemetryData.roll ?? d.roll,
            lat: telemetryData.lat ?? d.lat,
            lng: telemetryData.lng ?? d.lng,
          };
        }
        return d;
      }));
      if (idFromData != null) {
        setTelemetry(prev => ({ ...prev, [idFromData]: telemetryData }));
      }
    };

    const handleStatus = (status) => {
      if (status.connected !== undefined) {
        setBridgeConnected(status.connected);
        addLog(status.connected ? 'Bridge Server verbunden' : 'Bridge Server getrennt');
      }
      if (status.type === 'ap_connected') {
        addLog('ESP32 Access Point verbunden');
        setTimeout(() => droneConnection.discoverDrones(), 500);
      } else if (status.type === 'ap_disconnected') {
        addLog('ESP32 Access Point getrennt');
      }
      if (status.type === 'preflight' && status.id != null) {
        setPreflight(prev => ({ ...prev, [status.id]: status }));
        addLog(`Vorflugcheck Drohne ${status.id}: ${status.ok ? 'OK' : status.fail}`);
      }
      if (status.message) addLog('Bridge: ' + status.message);
    };

    const handleDroneList = (discoveredDrones) => {
      if (discoveredDrones.length > 0) {
        setDrones(prev => {
          const updated = [...prev];
          discoveredDrones.forEach(discovered => {
            const existing = updated.find(d => d.ip === discovered.ip);
            if (existing) {
              Object.assign(existing, { connected: true, name: discovered.name || existing.name });
            } else {
              updated.push({
                id: updated.length + 1,
                name: discovered.name || 'Drone-' + discovered.ip.split('.').pop(),
                ip: discovered.ip,
                connected: true,
                battery: 100,
                color: DRONE_COLORS[updated.length % DRONE_COLORS.length],
                x: 0, y: 0, z: 0, yaw: 0,
                targetReached: false
              });
            }
          });
          return updated;
        });
        addLog(discoveredDrones.length + ' Drohne(n) gefunden');
      }
    };

    droneConnection.connect(handleTelemetry, handleStatus, handleDroneList);
    return () => droneConnection.disconnect();
  }, []);

  // Auto-set t=0 keyframes when homePoint is first set
  const homePointRef = useRef(null);
  useEffect(() => {
    if (!gpsSettings.homePoint) return;
    if (homePointRef.current) return; // only on first set
    homePointRef.current = gpsSettings.homePoint;

    setKeyframes(prev => {
      const existing0Ids = prev.filter(kf => kf.time === 0).map(kf => kf.droneId);
      const newKfs = [];
      setDrones(currentDrones => {
        currentDrones.forEach((drone, i) => {
          if (!existing0Ids.includes(drone.id)) {
            newKfs.push({
              id: Date.now() + i,
              droneId: drone.id,
              time: 0,
              x: i * 1.5,
              y: 0,
              z: 0,
              r: 255, g: 255, b: 255, colorFn: 0, colorFp: 0,
            });
          }
        });
        return currentDrones;
      });
      if (newKfs.length > 0) {
        setTimeout(() => addLog(newKfs.length + ' Startpositionen bei t=0 automatisch gesetzt'), 0);
        return [...prev, ...newKfs];
      }
      return prev;
    });
  }, [gpsSettings.homePoint]); // eslint-disable-line react-hooks/exhaustive-deps

  const addLog = (message) => {
    const timestamp = new Date().toLocaleTimeString('de-DE');
    setLog(prev => [{ time: timestamp, message }, ...prev].slice(0, 50));
  };

  const addDrone = ({ name, ip }) => {
    setDrones(prev => {
      const id = prev.length > 0 ? Math.max(...prev.map(d => d.id)) + 1 : 1;
      addLog('Drohne hinzugefügt: ' + name + ' (' + ip + ')');
      return [...prev, {
        id, name, ip,
        connected: false, battery: 100,
        color: DRONE_COLORS[(id - 1) % DRONE_COLORS.length],
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0,
        targetReached: false
      }];
    });
  };

  const reorderDrones = (reordered) => {
    setDrones(reordered);
  };

  const toggleConnection = (droneId) => {
    const drone = drones.find(d => d.id === droneId);
    setDrones(prev => prev.map(d => d.id === droneId ? { ...d, connected: !d.connected } : d));
    addLog(drone.name + ': ' + (drone.connected ? 'Getrennt' : 'Verbunden'));
  };

  const discoverDrones = () => {
    if (!bridgeConnected) { addLog('Fehler: Bridge Server nicht verbunden!'); return; }
    addLog('Suche nach Drohnen...');
    droneConnection.discoverDrones();
  };

  const addKeyframe = (droneId) => {
    const maxTime = keyframes.length > 0 ? Math.max(...keyframes.map(kf => kf.time)) + 1 : 0;
    const newKf = { id: Date.now(), droneId, time: maxTime, x: 0, y: 0, z: 2,
                    r: 255, g: 255, b: 255, colorFn: 0, colorFp: 0 };
    setKeyframes(prev => [...prev, newKf]);
    addLog('Keyframe hinzugefügt für ' + (drones.find(d => d.id === droneId)?.name) + ' @ ' + maxTime + 's');
  };

  // Auto-start: create t=0 keyframe for all drones at ground level
  const setStartKeyframes = () => {
    const existing0 = keyframes.filter(kf => kf.time === 0).map(kf => kf.droneId);
    const newKfs = drones
      .filter(d => !existing0.includes(d.id))
      .map((drone, i) => ({
        id: Date.now() + i,
        droneId: drone.id,
        time: 0,
        x: i * 1.5,
        y: 0,
        z: 0,
        r: 255, g: 255, b: 255, colorFn: 0, colorFp: 0,
      }));
    if (newKfs.length === 0) {
      addLog('Alle Drohnen haben bereits einen Startpunkt @ t=0');
      return;
    }
    setKeyframes(prev => [...prev, ...newKfs]);
    addLog(newKfs.length + ' Startpositionen bei t=0 gesetzt');
  };

  const updateKeyframe = (keyframeId, field, value) => {
    setKeyframes(prev => prev.map(kf =>
      kf.id === keyframeId ? { ...kf, [field]: parseFloat(value) || 0 } : kf
    ));
  };

  const deleteKeyframe = (keyframeId) => {
    setKeyframes(prev => prev.filter(kf => kf.id !== keyframeId));
  };

  const uploadMissionToDrone = async (droneId) => {
    const drone = drones.find(d => d.id === droneId);
    if (!drone.connected) { addLog('Fehler: ' + drone.name + ' nicht verbunden!'); return; }
    if (!bridgeConnected) { addLog('Fehler: Bridge Server nicht verbunden!'); return; }
    const droneKfs = keyframes.filter(kf => kf.droneId === droneId).sort((a, b) => a.time - b.time);
    if (droneKfs.length === 0) { addLog('Fehler: Keine Keyframes für ' + drone.name); return; }
    try {
      await droneConnection.sendMission(drone.ip, droneKfs);
      addLog('Mission hochgeladen zu ' + drone.name + ': ' + droneKfs.length + ' Keyframes');
    } catch (error) { addLog('Fehler beim Upload: ' + error.message); }
  };

  const startMissionOnDrone = async (droneId) => {
    const drone = drones.find(d => d.id === droneId);
    if (!drone.connected || !bridgeConnected) return;
    try { await droneConnection.startMission(drone.ip); addLog('Mission gestartet auf ' + drone.name); }
    catch (error) { addLog('Fehler beim Start: ' + error.message); }
  };

  const stopMissionOnDrone = async (droneId) => {
    const drone = drones.find(d => d.id === droneId);
    if (!drone.connected || !bridgeConnected) return;
    try { await droneConnection.stopMission(drone.ip); addLog('Mission gestoppt auf ' + drone.name); }
    catch (error) { addLog('Fehler beim Stopp: ' + error.message); }
  };

  const emergencyStopDrone = async (droneId) => {
    const drone = drones.find(d => d.id === droneId);
    try { await droneConnection.emergencyStop(drone.ip); addLog('NOTAUS ' + drone.name + '!'); }
    catch (error) { addLog('NOTAUS Fehler: ' + error.message); }
  };

  const softLandDrone = async (droneId) => {
    const drone = drones.find(d => d.id === droneId);
    if (!drone || !drone.connected || !bridgeConnected) return;
    try { await droneConnection.softLand(drone.ip); addLog('Landen: ' + drone.name); }
    catch (error) { addLog('Landen Fehler: ' + error.message); }
  };

  const handleTimesync = () => {
    droneConnection.sendTimesync();
    addLog('Zeitsynchronisation gesendet');
  };

  const updateDroneModels = (time) => {
    droneModelsRef.current.forEach((model, index) => {
      const drone = drones[index];
      if (!drone) return;
      const dkf = keyframes.filter(kf => kf.droneId === drone.id).sort((a, b) => a.time - b.time);
      if (dkf.length === 0) return;
      let kf1 = dkf[0];
      let kf2 = dkf[dkf.length - 1];
      for (let i = 0; i < dkf.length - 1; i++) {
        if (dkf[i].time <= time && dkf[i + 1].time >= time) { kf1 = dkf[i]; kf2 = dkf[i + 1]; break; }
      }
      const t = kf2.time > kf1.time ? Math.max(0, Math.min(1, (time - kf1.time) / (kf2.time - kf1.time))) : 0;
      const pos = interpolate(kf1, kf2, t, interpolationMode);
      model.position.set(pos.x, pos.z, -pos.y);
      model.rotation.set(
        THREE.MathUtils.degToRad(pos.pitch),
        THREE.MathUtils.degToRad(pos.yaw),
        THREE.MathUtils.degToRad(pos.roll)
      );
      // Update LED color (RGB)
      if (model.material) {
        model.material.color.setRGB(
          (pos.r ?? 255) / 255,
          (pos.g ?? 255) / 255,
          (pos.b ?? 255) / 255
        );
      }
      setDrones(prev => prev.map(d => d.id === drone.id ? { ...d, x: pos.x, y: pos.y, z: pos.z, yaw: pos.yaw } : d));
    });
  };

  // Called when drone is moved via 3D gizmo
  const handleDroneMoved = (droneId, x, y, z) => {
    const existing = keyframes.find(kf => kf.droneId === droneId && Math.abs(kf.time - playbackTime) < 0.26);
    if (existing) {
      setKeyframes(prev => prev.map(kf =>
        kf.id === existing.id ? { ...kf, x, y, z } : kf
      ));
    } else {
      setKeyframes(prev => [...prev, {
        id: Date.now(), droneId, time: parseFloat(playbackTime.toFixed(2)),
        x, y, z, yaw: 0, pitch: 0, roll: 0
      }]);
    }
  };

  // Called when 3D model is moved via gizmo
  const handleModelTransform = (pos, scale) => {
    setModelPosition(pos);
    if (scale !== undefined) setModelScale(scale);
  };

  const seekToTime = (time) => {
    if (isPlaying) return;
    setPlaybackTime(time);
    updateDroneModels(time);
  };

  const startPlayback = () => {
    if (keyframes.length === 0) { addLog('Fehler: Keine Keyframes definiert!'); return; }
    setIsPlaying(true);
    setPlaybackTime(0);
    addLog('Playback gestartet');
    const maxKfTime = Math.max(...keyframes.map(kf => kf.time));
    let currentTime = 0;
    playbackIntervalRef.current = setInterval(() => {
      if (currentTime > maxKfTime) { stopPlayback(); return; }
      setPlaybackTime(currentTime);
      updateDroneModels(currentTime);
      currentTime += 0.1;
    }, 100);
  };

  const stopPlayback = () => {
    if (playbackIntervalRef.current) { clearInterval(playbackIntervalRef.current); playbackIntervalRef.current = null; }
    setIsPlaying(false);
    addLog('Playback gestoppt');
  };

  const emergencyStop = () => {
    stopPlayback();
    droneModelsRef.current.forEach(model => model.position.set(model.position.x, 0, model.position.z));
    addLog('NOTAUS! Alle Drohnen landen!');
  };

  const createFormation = (formationType) => {
    const connectedDrones = drones.filter(d => d.connected);
    if (connectedDrones.length === 0) { addLog('Keine verbundenen Drohnen für Formation'); return; }
    const time = keyframes.length > 0 ? Math.max(...keyframes.map(kf => kf.time)) + 1 : 0;
    const positions = createFormationPositions(formationType, connectedDrones.length);
    connectedDrones.forEach((drone, index) => {
      setKeyframes(prev => [...prev, {
        id: Date.now() + index, droneId: drone.id, time,
        x: positions[index].x, y: positions[index].y, z: positions[index].z,
        yaw: 0, pitch: 0, roll: 0
      }]);
    });
    addLog('Formation "' + formationType + '" erstellt @ ' + time + 's');
  };

  const handleLoad3DModel = () => {
    load3DModel(
      (model, vertices, fileName) => {
        setLoadedModel(model); setModelVertices(vertices);
        setSelectedVertices([]); setModelFileName(fileName); setShowModel(true);
      },
      () => {},
      (error) => addLog('Fehler: ' + error.message),
      addLog
    );
  };

  const handleVertexClick = (vertexIndex, isShiftHeld) => {
    setSelectedVertices(prev => {
      if (isShiftHeld) {
        return prev.includes(vertexIndex) ? prev.filter(i => i !== vertexIndex) : [...prev, vertexIndex];
      }
      return prev.includes(vertexIndex) && prev.length === 1 ? [] : [vertexIndex];
    });
  };

  const handleAssignToDrones = () => {
    if (selectedVertices.length === 0) { addLog('Keine Vertices ausgewählt!'); return; }
    if (drones.length === 0) { addLog('Keine Drohnen vorhanden!'); return; }
    const selectedPositions = selectedVertices.map(idx => modelVertices[idx]).filter(v => v);
    const baseTime = keyframes.length > 0 ? Math.max(...keyframes.map(kf => kf.time)) + 1 : 0;
    const newKeyframes = assignVerticesToDrones(selectedPositions, drones, baseTime, modelScale, modelPosition);
    if (newKeyframes.length > 0) {
      setKeyframes(prev => [...prev, ...newKeyframes]);
      addLog(newKeyframes.length + ' Keyframes aus Vertices erstellt @ ' + baseTime + 's');
    }
  };

  const handleClearModel = () => {
    setLoadedModel(null); setModelVertices([]); setSelectedVertices([]);
    setModelFileName(''); setShowModel(false);
    addLog('3D Modell entfernt');
  };

  const kfMaxTime = keyframes.length > 0 ? Math.max(...keyframes.map(kf => kf.time)) : 0;
  const maxTime = Math.max(maxTimeSetting, kfMaxTime);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold">{t('appTitle')}</h1>
          <button
            onClick={() => setLang(lang === 'de' ? 'en' : 'de')}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium border border-gray-600"
            title={lang === 'de' ? 'Switch to English' : 'Zu Deutsch wechseln'}
          >
            {lang === 'de' ? '🇩🇪 DE' : '🇬🇧 EN'}
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-4 border-b border-gray-700">
          <button
            onClick={() => setActiveTab('3d')}
            className={`px-4 py-2 rounded-t text-sm font-medium flex items-center gap-2 transition-colors ${activeTab === '3d' ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-white'}`}
          >
            <Box className="w-4 h-4" /> {t('tab3d')}
          </button>
          <button
            onClick={() => setActiveTab('gps')}
            className={`px-4 py-2 rounded-t text-sm font-medium flex items-center gap-2 transition-colors ${activeTab === 'gps' ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-white'}`}
          >
            <Map className="w-4 h-4" /> {t('tabGps')}
          </button>
        </div>

        {/* GPS Tab */}
        {activeTab === 'gps' && (
          <div className="mb-4">
            <GPSMissionPlanner
              drones={drones}
              gpsSettings={gpsSettings}
              onGpsSettingsChange={setGpsSettings}
              addLog={addLog}
            />
          </div>
        )}

        {/* 3D Tab */}
        {activeTab === '3d' && <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">

          {/* Left: 3D Viewport + Timeline + HeightProfile */}
          <div className="lg:col-span-3 space-y-4">

            {/* 3D Viewport */}
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-lg font-semibold">3D Viewport</h2>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={handleLoad3DModel} className="bg-cyan-600 hover:bg-cyan-700 px-3 py-1 rounded text-sm flex items-center gap-1">
                    <Box className="w-4 h-4" /> {t('model3d')}
                  </button>
                  <select
                    value={interpolationMode}
                    onChange={e => setInterpolationMode(e.target.value)}
                    className="bg-gray-700 px-3 py-1 rounded text-sm"
                  >
                    <option value="linear">Linear</option>
                    <option value="smooth">Smooth</option>
                  </select>
                  <button onClick={() => createFormation('circle')} className="bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded text-sm">{t('circle')}</button>
                  <button onClick={() => createFormation('line')} className="bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded text-sm">{t('line')}</button>
                  <button
                    onClick={setStartKeyframes}
                    className="bg-green-700 hover:bg-green-800 px-3 py-1 rounded text-sm flex items-center gap-1"
                    title={t('startPositions')}
                  >
                    <MapPin className="w-3 h-3" /> {t('startPositions')}
                  </button>
                </div>
              </div>

              <ThreeScene
                drones={drones}
                keyframes={keyframes}
                interpolationMode={interpolationMode}
                droneModelsRef={droneModelsRef}
                loadedModel={loadedModel}
                modelVertices={modelVertices}
                selectedVertices={selectedVertices}
                onVertexClick={handleVertexClick}
                modelScale={modelScale}
                modelPosition={modelPosition}
                onModelTransform={handleModelTransform}
                modelGizmoEnabled={modelGizmoEnabled}
                showModel={showModel}
                homePoint={gpsSettings.homePoint}
                onDroneMoved={handleDroneMoved}
              />

              <div className="mt-3 flex gap-2 flex-wrap">
                <button onClick={() => loadMission(setKeyframes, setInterpolationMode, addLog)} className="bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded flex items-center gap-2 text-sm">
                  <Upload className="w-4 h-4" /> Laden
                </button>
                <button onClick={() => saveMission(keyframes, interpolationMode, addLog)} className="bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded flex items-center gap-2 text-sm">
                  <Download className="w-4 h-4" /> Speichern
                </button>
                <button
                  onClick={isPlaying ? stopPlayback : startPlayback}
                  className={'flex-1 text-sm ' + (isPlaying ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700') + ' px-3 py-2 rounded flex items-center justify-center gap-2'}
                >
                  {isPlaying ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  {isPlaying ? 'Stop' : 'Play'}
                </button>
                <button onClick={emergencyStop} className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded flex items-center gap-2 text-sm">
                  <AlertCircle className="w-4 h-4" /> NOTAUS
                </button>
              </div>
            </div>

            {/* Timeline */}
            <Timeline
              keyframes={keyframes}
              drones={drones}
              playbackTime={playbackTime}
              isPlaying={isPlaying}
              selectedKeyframe={selectedKeyframe}
              setSelectedKeyframe={setSelectedKeyframe}
              onSeek={seekToTime}
              updateKeyframe={updateKeyframe}
              maxTimeSetting={maxTimeSetting}
              setMaxTimeSetting={setMaxTimeSetting}
            />

            {/* Height profile */}
            {keyframes.length > 0 && (
              <HeightProfile
                keyframes={keyframes}
                drones={drones}
                playbackTime={playbackTime}
                interpolationMode={interpolationMode}
                maxTime={maxTime}
              />
            )}

          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            <DronePanel
              drones={drones}
              toggleConnection={toggleConnection}
              addKeyframe={addKeyframe}
              uploadMissionToDrone={uploadMissionToDrone}
              startMissionOnDrone={startMissionOnDrone}
              stopMissionOnDrone={stopMissionOnDrone}
              emergencyStopDrone={emergencyStopDrone}
              softLandDrone={softLandDrone}
              bridgeConnected={bridgeConnected}
              discoverDrones={discoverDrones}
              onAddDrone={addDrone}
              onReorderDrones={reorderDrones}
              telemetry={telemetry}
              preflight={preflight}
            />

            <MissionExport
              drones={drones}
              keyframes={keyframes}
              gpsSettings={gpsSettings}
              interpolationMode={interpolationMode}
              addLog={addLog}
            />

            <div className="bg-gray-800 rounded-lg p-3">
              <button
                onClick={handleTimesync}
                disabled={!bridgeConnected}
                className="w-full bg-cyan-700 hover:bg-cyan-800 disabled:bg-gray-700 py-1.5 rounded text-xs flex items-center justify-center gap-1"
                title="Zeitsynchronisation an alle Drohnen senden"
              >
                <RefreshCw className="w-3 h-3" /> Zeitsync
              </button>
            </div>

            {loadedModel && (
              <ModelControls
                modelFileName={modelFileName}
                showModel={showModel}
                setShowModel={setShowModel}
                modelScale={modelScale}
                setModelScale={setModelScale}
                modelPosition={modelPosition}
                setModelPosition={setModelPosition}
                modelVertices={modelVertices}
                selectedVertices={selectedVertices}
                onClearSelection={() => setSelectedVertices([])}
                onAssignToDrones={handleAssignToDrones}
                onClearModel={handleClearModel}
                modelGizmoEnabled={modelGizmoEnabled}
                onToggleModelGizmo={() => setModelGizmoEnabled(v => !v)}
              />
            )}

            <KeyframeEditor
              keyframes={keyframes}
              drones={drones}
              selectedKeyframe={selectedKeyframe}
              updateKeyframe={updateKeyframe}
              deleteKeyframe={deleteKeyframe}
            />
          </div>
        </div>}

        <EventLog log={log} />
        <div className="mt-4">
          <BlackboxViewer />
        </div>
      </div>
    </div>
  );
};

export default MultiDroneControl;
