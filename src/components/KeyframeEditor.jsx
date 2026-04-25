import React from 'react';
import { Trash2 } from 'lucide-react';
import { useLanguage } from '../i18n';

const KeyframeEditor = ({ keyframes, drones, selectedKeyframe, updateKeyframe, deleteKeyframe }) => {
  const { t } = useLanguage();

  const handleColorChange = (kfId, hex) => {
    const h = hex.replace('#', '');
    updateKeyframe(kfId, 'r', parseInt(h.slice(0, 2), 16));
    updateKeyframe(kfId, 'g', parseInt(h.slice(2, 4), 16));
    updateKeyframe(kfId, 'b', parseInt(h.slice(4, 6), 16));
  };

  const toHex = (r, g, b) => {
    const v = n => Math.max(0, Math.min(255, Math.round(n || 0)));
    return '#' + [v(r), v(g), v(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-xl font-semibold mb-4">{t('keyframes')}</h2>
      <div className="max-h-96 overflow-y-auto space-y-2">
        {keyframes.sort((a, b) => a.time - b.time).map(kf => {
          const drone = drones.find(d => d.id === kf.droneId);
          const r = kf.r ?? 255, g = kf.g ?? 255, b = kf.b ?? 255;
          return (
            <div key={kf.id} className={`bg-gray-700 rounded p-2 text-xs ${selectedKeyframe === kf.id ? 'ring-2 ring-blue-500' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold" style={{ color: `#${drone?.color.toString(16).padStart(6, '0')}` }}>
                  {drone?.name}
                </span>
                <button onClick={() => deleteKeyframe(kf.id)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {[
                  [t('time'), 'time', 0.1],
                  ['X', 'x', 0.1],
                  ['Y', 'y', 0.1],
                  [t('height'), 'z', 0.1],
                ].map(([label, field, step]) => (
                  <div key={field} className="flex flex-col">
                    <span className="text-gray-400 text-xs mb-0.5">{label}</span>
                    <input type="number" value={kf[field]}
                      onChange={e => updateKeyframe(kf.id, field, e.target.value)}
                      className="bg-gray-600 rounded px-1 py-0.5" step={step} />
                  </div>
                ))}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <span className="text-gray-400">{t('led')}:</span>
                <input type="color" value={toHex(r, g, b)}
                  onChange={e => handleColorChange(kf.id, e.target.value)}
                  className="w-8 h-6 rounded cursor-pointer border-0 bg-transparent" />
                <span className="text-gray-400 font-mono text-xs">
                  {Math.round(r)},{Math.round(g)},{Math.round(b)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-gray-400 text-xs">{t('colorFunction')}:</span>
                <select value={kf.colorFn ?? 0}
                  onChange={e => updateKeyframe(kf.id, 'colorFn', parseInt(e.target.value))}
                  className="bg-gray-600 rounded px-1 py-0.5 text-xs">
                  <option value={0}>{t('fnSolid')}</option>
                  <option value={1}>{t('fnPulse')}</option>
                  <option value={2}>{t('fnStrobe')}</option>
                </select>
                {(kf.colorFn ?? 0) > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400 text-xs">
                      {(kf.colorFn ?? 0) === 1 ? t('periodMs') : t('intervalMs')}:
                    </span>
                    <input type="number" value={kf.colorFp ?? 1000}
                      onChange={e => updateKeyframe(kf.id, 'colorFp', parseInt(e.target.value))}
                      className="bg-gray-600 rounded px-1 py-0.5 w-16 text-xs" min={50} step={50} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {keyframes.length === 0 && (
          <div className="text-gray-500 text-xs text-center py-4">{t('noKeyframes')}</div>
        )}
      </div>
    </div>
  );
};

export default KeyframeEditor;
