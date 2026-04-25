import React, { useState, useRef } from 'react';
import { Wifi, WifiOff, Plus, Target, Play, Square, AlertCircle, Radio, Search, UserPlus, X, Check, GripVertical, PlaneLanding } from 'lucide-react';
import { useLanguage } from '../i18n';

const MODE_COLOR = {
  0: 'bg-gray-600',
  1: 'bg-blue-600',
  2: 'bg-green-600',
  3: 'bg-orange-500',
  4: 'bg-yellow-500',
};
const MODE_KEY = { 0: 'modeDisarmed', 1: 'modeStabilize', 2: 'modeMission', 3: 'modeRth', 4: 'modeLand' };

function RssiBar({ rssi }) {
  const color = rssi > -80 ? 'text-green-400' : rssi > -100 ? 'text-yellow-400' : 'text-red-400';
  const bars = rssi > -80 ? 4 : rssi > -90 ? 3 : rssi > -100 ? 2 : 1;
  return (
    <span className={`inline-flex items-center gap-1 ${color}`}>
      <span className="flex items-end gap-px h-3">
        {[1,2,3,4].map(b => (
          <span key={b} className={`w-1 rounded-sm ${b <= bars ? 'bg-current' : 'bg-gray-600'}`}
            style={{ height: `${b * 3}px` }} />
        ))}
      </span>
      <span>{rssi} dBm</span>
    </span>
  );
}

const DronePanel = ({
  drones,
  toggleConnection,
  addKeyframe,
  uploadMissionToDrone,
  startMissionOnDrone,
  stopMissionOnDrone,
  emergencyStopDrone,
  softLandDrone,
  bridgeConnected,
  discoverDrones,
  onAddDrone,
  onReorderDrones,
  telemetry = {},
  preflight = {},
}) => {
  const { t } = useLanguage();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIp, setNewIp] = useState('');
  const dragIndex = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleAddDrone = () => {
    const name = newName.trim() || ('Drohne-' + String(drones.length + 1).padStart(2, '0'));
    const ip = newIp.trim();
    if (!ip) return;
    onAddDrone({ name, ip });
    setNewName('');
    setNewIp('');
    setShowAddForm(false);
  };

  const handleDragStart = (e, index) => { dragIndex.current = index; e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e, index) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverIndex(index); };
  const handleDrop = (e, index) => {
    e.preventDefault();
    if (dragIndex.current === null || dragIndex.current === index) { setDragOverIndex(null); return; }
    const reordered = [...drones];
    const [moved] = reordered.splice(dragIndex.current, 1);
    reordered.splice(index, 0, moved);
    onReorderDrones && onReorderDrones(reordered);
    dragIndex.current = null;
    setDragOverIndex(null);
  };
  const handleDragEnd = () => { dragIndex.current = null; setDragOverIndex(null); };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Wifi className="w-5 h-5" />
            {t('drones')}
          </h2>
          <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${bridgeConnected ? 'bg-green-600' : 'bg-red-600'}`}>
            <Radio className="w-3 h-3" />
            {bridgeConnected ? t('bridgeOk') : t('bridgeNo')}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={discoverDrones}
            className="flex-1 bg-blue-600 hover:bg-blue-700 py-1 rounded text-xs flex items-center justify-center gap-1"
            disabled={!bridgeConnected}
          >
            <Search className="w-3 h-3" /> {t('search')}
          </button>
          <button
            onClick={() => setShowAddForm(v => !v)}
            className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${showAddForm ? 'bg-gray-600' : 'bg-teal-600 hover:bg-teal-700'}`}
            title={t('addDronePlaceholder')}
          >
            <UserPlus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="bg-gray-700 rounded p-2 mb-3 space-y-2">
          <div className="text-xs font-medium text-teal-300">{t('addDronePlaceholder')}</div>
          <input type="text" placeholder={t('namePlaceholder')} value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full bg-gray-600 text-white text-xs rounded px-2 py-1" />
          <input type="text" placeholder={t('ipPlaceholder')} value={newIp}
            onChange={e => setNewIp(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddDrone()}
            className="w-full bg-gray-600 text-white text-xs rounded px-2 py-1" />
          <div className="flex gap-1">
            <button onClick={handleAddDrone} disabled={!newIp.trim()}
              className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-600 py-1 rounded text-xs flex items-center justify-center gap-1">
              <Check className="w-3 h-3" /> {t('add')}
            </button>
            <button onClick={() => { setShowAddForm(false); setNewName(''); setNewIp(''); }}
              className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {drones.map((drone, index) => {
          const telem = telemetry[drone.id];
          const pf = preflight[drone.id];
          const modeKey = MODE_KEY[telem?.mode ?? 0] || 'modeDisarmed';
          const modeColor = MODE_COLOR[telem?.mode ?? 0] || 'bg-gray-600';

          return (
            <div key={drone.id} draggable
              onDragStart={e => handleDragStart(e, index)}
              onDragOver={e => handleDragOver(e, index)}
              onDrop={e => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={`bg-gray-700 rounded p-2 transition-all ${dragOverIndex === index ? 'ring-2 ring-blue-400 opacity-80' : ''}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <GripVertical className="w-3 h-3 text-gray-500 cursor-grab flex-shrink-0" />
                  <div className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: `#${drone.color.toString(16).padStart(6, '0')}` }} />
                  <span className="font-semibold text-sm truncate">{drone.name}</span>
                </div>
                <button onClick={() => toggleConnection(drone.id)}
                  className={`p-1 rounded flex-shrink-0 ${drone.connected ? 'bg-green-600' : 'bg-red-600'}`}>
                  {drone.connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                </button>
              </div>

              <div className="text-xs text-gray-300 mb-2">
                <div>IP: {drone.ip}</div>
                <div>{t('pos')}: ({drone.x.toFixed(1)}, {drone.y.toFixed(1)}, {drone.z.toFixed(1)})</div>
              </div>

              {telem && (
                <div className="bg-gray-800 rounded p-2 mb-2 text-xs space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded text-white text-xs font-medium ${telem.arm ? 'bg-green-600' : 'bg-gray-600'}`}>
                      {telem.arm ? t('armed') : t('disarmed')}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-white text-xs font-medium ${modeColor}`}>
                      {t(modeKey)}
                    </span>
                    {telem.wp != null && <span className="text-gray-400">{t('waypoint')} {telem.wp}</span>}
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    <span className="text-blue-300">AGL: {telem.agl != null ? telem.agl.toFixed(1) : '--'} m</span>
                    {telem.rssi != null && <RssiBar rssi={telem.rssi} />}
                  </div>
                  <div className="text-gray-300">
                    GPS: {telem.lat != null ? telem.lat.toFixed(2) : '--'}° / {telem.lng != null ? telem.lng.toFixed(2) : '--'}°
                    {telem.sats != null && <span className="ml-1 text-gray-400">({telem.sats} Sat)</span>}
                  </div>
                  <div className="text-gray-500">
                    {telem.pres != null && <span>{telem.pres.toFixed(1)} hPa</span>}
                    {telem.temp != null && <span className="ml-2">{telem.temp.toFixed(1)} °C</span>}
                  </div>
                </div>
              )}

              {pf && (
                <div className={`rounded px-2 py-1 mb-2 text-xs font-medium ${pf.ok ? 'bg-green-800 text-green-200' : 'bg-red-900 text-red-200'}`}>
                  {pf.ok ? t('preflightOk') : `${t('preflightFail')}: ${pf.fail}`}
                </div>
              )}

              <div className="flex gap-1 mb-1">
                <button onClick={() => addKeyframe(drone.id)}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 py-1 rounded text-xs flex items-center justify-center gap-1">
                  <Plus className="w-3 h-3" /> {t('keyframe')}
                </button>
                <button onClick={() => uploadMissionToDrone(drone.id)}
                  className="flex-1 bg-green-600 hover:bg-green-700 py-1 rounded text-xs flex items-center justify-center gap-1"
                  disabled={!bridgeConnected}>
                  <Target className="w-3 h-3" /> {t('upload')}
                </button>
              </div>

              <div className="flex gap-1">
                <button onClick={() => startMissionOnDrone(drone.id)}
                  className="flex-1 bg-green-700 hover:bg-green-800 py-1 rounded text-xs flex items-center justify-center gap-1"
                  disabled={!drone.connected || !bridgeConnected}>
                  <Play className="w-3 h-3" /> {t('start')}
                </button>
                <button onClick={() => stopMissionOnDrone(drone.id)}
                  className="flex-1 bg-yellow-600 hover:bg-yellow-700 py-1 rounded text-xs flex items-center justify-center gap-1"
                  disabled={!drone.connected || !bridgeConnected}>
                  <Square className="w-3 h-3" /> {t('stop')}
                </button>
                <button onClick={() => softLandDrone && softLandDrone(drone.id)}
                  className="flex-1 bg-yellow-500 hover:bg-yellow-600 py-1 rounded text-xs flex items-center justify-center gap-1"
                  disabled={!drone.connected || !bridgeConnected}>
                  <PlaneLanding className="w-3 h-3" /> {t('land')}
                </button>
                <button onClick={() => emergencyStopDrone(drone.id)}
                  className="flex-1 bg-red-600 hover:bg-red-700 py-1 rounded text-xs flex items-center justify-center gap-1"
                  disabled={!bridgeConnected}>
                  <AlertCircle className="w-3 h-3" /> {t('emergencyStop')}
                </button>
              </div>
            </div>
          );
        })}

        {drones.length === 0 && (
          <div className="text-center text-gray-500 text-xs py-4">{t('noDrones')}</div>
        )}
      </div>
    </div>
  );
};

export default DronePanel;
