import React, { useState, useRef, useCallback } from 'react';
import { ChevronDown, ChevronUp, Upload } from 'lucide-react';
import { useLanguage } from '../i18n';

// CSV columns: t_ms,roll,pitch,yaw_r,agl,pres,m1,m2,m3,m4,mode,wp
const COLS = ['t_ms','roll','pitch','yaw_r','agl','pres','m1','m2','m3','m4','mode','wp'];

const MODE_COLORS = { 0: '#6b7280', 1: '#3b82f6', 2: '#22c55e', 3: '#f97316', 4: '#eab308' };

function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return null;
  const header = lines[0].split(',').map(h => h.trim());
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',');
    if (vals.length < header.length) continue;
    const rec = {};
    header.forEach((col, j) => { rec[col] = parseFloat(vals[j]); });
    records.push(rec);
  }
  return records.length > 0 ? records : null;
}

function minMax(data, key) {
  let mn = Infinity, mx = -Infinity;
  for (const r of data) {
    if (r[key] < mn) mn = r[key];
    if (r[key] > mx) mx = r[key];
  }
  return [mn, mx];
}

function Chart({ data, lines, width, height, timeKey, tooltip, onHover }) {
  // lines: [{key, color, label}]
  const svgRef = useRef(null);

  const tMin = data[0][timeKey];
  const tMax = data[data.length - 1][timeKey];
  const tRange = tMax - tMin || 1;

  let yMin = Infinity, yMax = -Infinity;
  for (const { key } of lines) {
    for (const r of data) {
      if (r[key] < yMin) yMin = r[key];
      if (r[key] > yMax) yMax = r[key];
    }
  }
  const yRange = yMax - yMin || 1;

  const PAD_L = 36, PAD_R = 8, PAD_T = 8, PAD_B = 18;
  const W = width - PAD_L - PAD_R;
  const H = height - PAD_T - PAD_B;

  const tx = t => PAD_L + ((t - tMin) / tRange) * W;
  const ty = v => PAD_T + H - ((v - yMin) / yRange) * H;

  // Mode change markers
  const modeChanges = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i].mode !== data[i-1].mode) {
      modeChanges.push({ t: data[i][timeKey], mode: data[i].mode });
    }
  }

  const handleMouseMove = (e) => {
    if (!onHover) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left - PAD_L;
    const frac = Math.max(0, Math.min(1, mx / W));
    const t = tMin + frac * tRange;
    let closest = data[0];
    let closestDist = Infinity;
    for (const r of data) {
      const d = Math.abs(r[timeKey] - t);
      if (d < closestDist) { closestDist = d; closest = r; }
    }
    onHover(closest, e.clientX, e.clientY);
  };

  return (
    <svg
      ref={svgRef}
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => onHover && onHover(null)}
    >
      {/* Mode change markers */}
      {modeChanges.map((mc, i) => (
        <line key={i}
          x1={tx(mc.t)} y1={PAD_T}
          x2={tx(mc.t)} y2={PAD_T + H}
          stroke={MODE_COLORS[mc.mode] || '#6b7280'}
          strokeWidth={1}
          strokeDasharray="3,2"
          opacity={0.7}
        />
      ))}
      {/* Y axis labels */}
      <text x={PAD_L - 2} y={PAD_T + 6} fill="#9ca3af" fontSize="9" textAnchor="end">{yMax.toFixed(1)}</text>
      <text x={PAD_L - 2} y={PAD_T + H} fill="#9ca3af" fontSize="9" textAnchor="end">{yMin.toFixed(1)}</text>
      {/* X axis labels */}
      <text x={PAD_L} y={height - 2} fill="#9ca3af" fontSize="9">{(tMin / 1000).toFixed(1)}s</text>
      <text x={PAD_L + W} y={height - 2} fill="#9ca3af" fontSize="9" textAnchor="end">{(tMax / 1000).toFixed(1)}s</text>
      {/* Grid line */}
      <line x1={PAD_L} y1={PAD_T + H} x2={PAD_L + W} y2={PAD_T + H} stroke="#374151" strokeWidth={1} />
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + H} stroke="#374151" strokeWidth={1} />
      {/* Lines */}
      {lines.map(({ key, color }) => {
        const pts = data.map(r => `${tx(r[timeKey]).toFixed(1)},${ty(r[key]).toFixed(1)}`).join(' ');
        return <polyline key={key} points={pts} fill="none" stroke={color} strokeWidth={1.5} />;
      })}
      {/* Tooltip marker */}
      {tooltip && (
        <line
          x1={tx(tooltip[timeKey])} y1={PAD_T}
          x2={tx(tooltip[timeKey])} y2={PAD_T + H}
          stroke="white" strokeWidth={1} opacity={0.5}
        />
      )}
    </svg>
  );
}

const BlackboxViewer = () => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [records, setRecords] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef(null);

  const handleFile = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result);
      setRecords(parsed);
      if (parsed) setExpanded(true);
    };
    reader.readAsText(file);
  }, []);

  const handleHover = useCallback((rec, x, y) => {
    setTooltip(rec || null);
    if (rec) setTooltipPos({ x, y });
  }, []);

  const summary = records ? (() => {
    const dur = (records[records.length - 1].t_ms - records[0].t_ms) / 1000;
    const [aglMin, aglMax] = minMax(records, 'agl');
    const [presMin, presMax] = minMax(records, 'pres');
    return { dur, count: records.length, aglMax, presMin, presMax };
  })() : null;

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">{t('blackboxViewer')}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-xs flex items-center gap-1"
          >
            <Upload className="w-3 h-3" /> {t('loadFile')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFile}
          />
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1 bg-gray-700 hover:bg-gray-600 rounded"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && records && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="bg-gray-700 rounded px-3 py-2 text-xs flex flex-wrap gap-4 text-gray-300">
            <span>{t('duration')}: <strong className="text-white">{summary.dur.toFixed(1)} s</strong></span>
            <span>{t('records')}: <strong className="text-white">{summary.count}</strong></span>
            <span>{t('maxAgl')}: <strong className="text-white">{summary.aglMax.toFixed(1)} m</strong></span>
            <span>{t('minPres')}–{t('maxPres')}: <strong className="text-white">{summary.presMin.toFixed(1)}–{summary.presMax.toFixed(1)} hPa</strong></span>
          </div>

          {/* Legend */}
          <div className="flex gap-3 flex-wrap text-xs">
            {[
              { color: '#3b82f6', label: 'Höhe (AGL)' },
              { color: '#ef4444', label: 'M1' },
              { color: '#22c55e', label: 'M2' },
              { color: '#3b82f6', label: 'M3' },
              { color: '#f97316', label: 'M4' },
              { color: '#06b6d4', label: 'Roll' },
              { color: '#d946ef', label: 'Pitch' },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1">
                <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: color }} />
                <span className="text-gray-400">{label}</span>
              </span>
            ))}
            <span className="flex items-center gap-1 text-gray-500">| Modus-Wechsel: gestrichelt</span>
          </div>

          {/* Chart 1: AGL */}
          <div className="bg-gray-900 rounded overflow-hidden">
            <div className="text-xs text-gray-400 px-2 pt-1">{t('chartAgl')}</div>
            <Chart
              data={records}
              lines={[{ key: 'agl', color: '#3b82f6', label: 'AGL' }]}
              width={800}
              height={88}
              timeKey="t_ms"
              tooltip={tooltip}
              onHover={handleHover}
            />
          </div>

          {/* Chart 2: Motors */}
          <div className="bg-gray-900 rounded overflow-hidden">
            <div className="text-xs text-gray-400 px-2 pt-1">{t('chartMotors')}</div>
            <Chart
              data={records}
              lines={[
                { key: 'm1', color: '#ef4444', label: 'M1' },
                { key: 'm2', color: '#22c55e', label: 'M2' },
                { key: 'm3', color: '#3b82f6', label: 'M3' },
                { key: 'm4', color: '#f97316', label: 'M4' },
              ]}
              width={800}
              height={88}
              timeKey="t_ms"
              tooltip={tooltip}
              onHover={handleHover}
            />
          </div>

          {/* Chart 3: Roll + Pitch */}
          <div className="bg-gray-900 rounded overflow-hidden">
            <div className="text-xs text-gray-400 px-2 pt-1">{t('chartAttitude')}</div>
            <Chart
              data={records}
              lines={[
                { key: 'roll',  color: '#06b6d4', label: 'Roll' },
                { key: 'pitch', color: '#d946ef', label: 'Pitch' },
              ]}
              width={800}
              height={88}
              timeKey="t_ms"
              tooltip={tooltip}
              onHover={handleHover}
            />
          </div>

          {/* Tooltip overlay */}
          {tooltip && (
            <div
              className="fixed z-50 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 pointer-events-none shadow-lg"
              style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 60 }}
            >
              <div className="font-medium text-white">{(tooltip.t_ms / 1000).toFixed(2)} s</div>
              <div>Höhe: {tooltip.agl?.toFixed(2)} m</div>
              <div>M1:{tooltip.m1} M2:{tooltip.m2} M3:{tooltip.m3} M4:{tooltip.m4}</div>
              <div>Roll:{tooltip.roll?.toFixed(1)}° Pitch:{tooltip.pitch?.toFixed(1)}°</div>
              <div className="text-gray-400">Modus: {tooltip.mode} | WP: {tooltip.wp}</div>
            </div>
          )}
        </div>
      )}

      {expanded && !records && (
        <div className="text-center text-gray-500 text-xs py-6">{t('noFile')}</div>
      )}
    </div>
  );
};

export default BlackboxViewer;
