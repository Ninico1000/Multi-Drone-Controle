import React, { useState, useMemo } from 'react';
import { Download, ChevronDown, FileJson, CheckCircle, AlertTriangle } from 'lucide-react';
import { interpolate } from '../utils/interpolation';
import { useLanguage } from '../i18n';

const MAX_SPEED = 5;

const MissionExport = ({ drones, keyframes, gpsSettings, interpolationMode, addLog }) => {
  const { t } = useLanguage();
  const [selectedDroneId, setSelectedDroneId] = useState('');
  const [lastExported, setLastExported] = useState(null);

  const selectedDrone = drones.find(d => d.id === parseInt(selectedDroneId, 10));
  const droneKeyframes = selectedDrone
    ? keyframes.filter(kf => kf.droneId === selectedDrone.id).sort((a, b) => a.time - b.time)
    : [];
  const duration = droneKeyframes.length > 0 ? Math.max(...droneKeyframes.map(kf => kf.time)) : 0;

  const speedWarnings = useMemo(() => {
    if (droneKeyframes.length < 2) return [];
    const warnings = [];
    for (let i = 0; i < droneKeyframes.length - 1; i++) {
      const a = droneKeyframes[i], b = droneKeyframes[i + 1];
      const dt = b.time - a.time;
      if (dt <= 0) continue;
      const dist = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2);
      const speed = dist / dt;
      if (speed > MAX_SPEED) warnings.push({ from: a.time, to: b.time, speed: speed.toFixed(1) });
    }
    return warnings;
  }, [droneKeyframes]);

  const allSpeedWarnings = useMemo(() => {
    const all = [];
    drones.forEach(drone => {
      const dkf = keyframes.filter(kf => kf.droneId === drone.id).sort((a, b) => a.time - b.time);
      for (let i = 0; i < dkf.length - 1; i++) {
        const a = dkf[i], b = dkf[i + 1];
        const dt = b.time - a.time;
        if (dt <= 0) continue;
        const dist = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2);
        const speed = dist / dt;
        if (speed > MAX_SPEED) all.push({ drone: drone.name, from: a.time, to: b.time, speed: speed.toFixed(1) });
      }
    });
    return all;
  }, [drones, keyframes]);

  const handleExport = () => {
    if (!selectedDrone || droneKeyframes.length < 2) return;

    const waypoints = [];
    let time = 0;
    while (time <= duration + 0.001) {
      let kf1 = droneKeyframes[0], kf2 = droneKeyframes[droneKeyframes.length - 1];
      for (let i = 0; i < droneKeyframes.length - 1; i++) {
        if (droneKeyframes[i].time <= time && droneKeyframes[i + 1].time >= time) {
          kf1 = droneKeyframes[i]; kf2 = droneKeyframes[i + 1]; break;
        }
      }
      const alpha = kf2.time > kf1.time ? Math.max(0, Math.min(1, (time - kf1.time) / (kf2.time - kf1.time))) : 0;
      const pos = interpolate(kf1, kf2, alpha, interpolationMode);
      waypoints.push({
        time: parseFloat(time.toFixed(2)),
        x: parseFloat(pos.x.toFixed(4)),
        y: parseFloat(pos.y.toFixed(4)),
        z: parseFloat(pos.z.toFixed(4)),
        r: Math.round(pos.r),
        g: Math.round(pos.g),
        b: Math.round(pos.b),
        fn: pos.colorFn,
        fp: pos.colorFp,
      });
      time += 0.5;
    }

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      drone: { name: selectedDrone.name, ip: selectedDrone.ip },
      mission: {
        interpolationMode, duration: parseFloat(duration.toFixed(2)), waypointInterval: 0.5,
        homePoint: gpsSettings.homePoint || null,
        emergencyPoint: gpsSettings.emergencyPoint || null,
        geofence: gpsSettings.geofenceCenter
          ? { center: gpsSettings.geofenceCenter, radius: gpsSettings.geofenceRadius }
          : null,
      },
      waypoints,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = selectedDrone.name.replace(/\s+/g, '_') + '_mission.json';
    link.click();
    URL.revokeObjectURL(url);

    setLastExported(selectedDrone.name);
    addLog('Mission exportiert: ' + selectedDrone.name + ' — ' + waypoints.length + ' Wegpunkte');
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <FileJson className="w-5 h-5 text-orange-400" />
        {t('missionExport')}
      </h2>

      {allSpeedWarnings.length > 0 && (
        <div className="mb-3 bg-yellow-900 border border-yellow-600 rounded p-2 space-y-1">
          <div className="flex items-center gap-1 text-yellow-300 text-xs font-semibold">
            <AlertTriangle className="w-3 h-3" /> {t('speedWarning')} (&gt;{MAX_SPEED} m/s)
          </div>
          {allSpeedWarnings.map((w, i) => (
            <div key={i} className="text-xs text-yellow-200">
              {w.drone}: {w.speed} m/s {t('speedAt')} {w.from}s – {w.to}s
            </div>
          ))}
        </div>
      )}

      <div className="mb-3">
        <label className="text-xs text-gray-400 block mb-1">{t('drone')}:</label>
        <div className="relative">
          <select value={selectedDroneId}
            onChange={e => { setSelectedDroneId(e.target.value); setLastExported(null); }}
            className="w-full bg-gray-700 text-white text-sm rounded px-3 py-2 pr-8 appearance-none border border-gray-600 focus:border-orange-500 outline-none">
            <option value="">{t('selectDrone')}</option>
            {drones.map(d => {
              const kfCount = keyframes.filter(kf => kf.droneId === d.id).length;
              return <option key={d.id} value={String(d.id)}>{d.name} ({kfCount} KF)</option>;
            })}
          </select>
          <ChevronDown className="w-4 h-4 absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {selectedDrone && (
        <div className="bg-gray-700 rounded p-3 mb-3 text-xs space-y-1">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-300">
            <span>{t('keyframesCount')}:</span>
            <span className={droneKeyframes.length < 2 ? 'text-red-400' : 'text-white'}>{droneKeyframes.length}</span>
            <span>{t('duration')}:</span><span className="text-white">{duration.toFixed(1)} s</span>
            <span>{t('waypointsCount')}:</span><span className="text-white">{duration > 0 ? Math.floor(duration / 0.5) + 1 : 0}</span>
          </div>

          {speedWarnings.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {speedWarnings.map((w, i) => (
                <div key={i} className="flex items-center gap-1 text-yellow-300">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  <span>{w.speed} m/s @ {w.from}s – {w.to}s</span>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-gray-600 pt-1.5 mt-1.5 space-y-0.5">
            {[
              { labelKey: 'startPoint', val: gpsSettings.homePoint, color: 'bg-green-400' },
              { labelKey: 'emergency', val: gpsSettings.emergencyPoint, color: 'bg-orange-400' },
              { labelKey: 'geofence', val: gpsSettings.geofenceCenter, color: 'bg-blue-400', extra: gpsSettings.geofenceRadius + 'm' },
            ].map(({ labelKey, val, color, extra }) => (
              <div key={labelKey} className="flex items-center gap-1.5 text-gray-300">
                <div className={`w-2 h-2 rounded-full ${val ? color : 'bg-gray-500'}`} />
                {t(labelKey)}: {val ? (extra || `${val.lat.toFixed(5)}, ${val.lng.toFixed(5)}`) : t('notSet')}
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={handleExport} disabled={!selectedDrone || droneKeyframes.length < 2}
        className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed py-2 rounded text-sm flex items-center justify-center gap-2 font-medium">
        <Download className="w-4 h-4" />
        {t('downloadJson')}
      </button>

      {lastExported && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-green-400">
          <CheckCircle className="w-3 h-3" /> {lastExported} — {t('readyForSd')}
        </div>
      )}
    </div>
  );
};

export default MissionExport;
