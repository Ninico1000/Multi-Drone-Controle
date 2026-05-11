import React, { useRef, useEffect, useState } from 'react';
import { Radio, Trash2, RefreshCw, Plug, Unplug } from 'lucide-react';

const MAX_LINES = 200;
const BAUD_RATES = [9600, 19200, 57600, 115200, 921600];

function PortSelector({ ports = [], connected, selectedPath, baudRate = 115200, onPathChange, onBaudChange, onConnect, onDisconnect, onRefresh, disabled = false }) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <select
        value={selectedPath || ''}
        onChange={e => onPathChange && onPathChange(e.target.value)}
        disabled={connected || disabled}
        className="flex-1 min-w-0 bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600 disabled:opacity-50"
      >
        <option value="">-- Port wählen --</option>
        {ports.map(p => (
          <option key={p.path} value={p.path}>
            {p.path}{p.manufacturer ? ` (${p.manufacturer})` : ''}
          </option>
        ))}
      </select>

      <select
        value={baudRate}
        onChange={e => onBaudChange && onBaudChange(Number(e.target.value))}
        disabled={connected || disabled}
        className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600 disabled:opacity-50"
      >
        {BAUD_RATES.map(b => <option key={b} value={b}>{b}</option>)}
      </select>

      <button
        onClick={onRefresh}
        disabled={connected || disabled}
        className="p-1.5 bg-gray-600 hover:bg-gray-500 rounded disabled:opacity-40"
        title="Ports aktualisieren"
      >
        <RefreshCw className="w-3 h-3" />
      </button>

      {connected ? (
        <button onClick={onDisconnect} disabled={disabled} className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs flex items-center gap-1 disabled:opacity-40">
          <Unplug className="w-3 h-3" /> Trennen
        </button>
      ) : (
        <button onClick={() => onConnect && onConnect(selectedPath, baudRate)} disabled={!selectedPath || disabled} className="px-2 py-1 bg-green-700 hover:bg-green-600 rounded text-xs flex items-center gap-1 disabled:opacity-40">
          <Plug className="w-3 h-3" /> Verbinden
        </button>
      )}
    </div>
  );
}

const LoraTerminal = ({
  lines = [],
  connected,
  availablePorts = [],
  onConnect,
  onDisconnect,
  onRefresh,
  onClear,
}) => {
  const scrollRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedPath, setSelectedPath] = useState('');
  const [baudRate, setBaudRate] = useState(115200);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  return (
    <div className="bg-gray-800 rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Radio className="w-5 h-5 text-green-400" />
          LoRa Terminal
        </h2>
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${connected ? 'bg-green-700' : 'bg-gray-600'}`}>
          {connected ? 'Verbunden' : 'Getrennt'}
        </span>
      </div>

      <PortSelector
        ports={availablePorts}
        connected={connected}
        selectedPath={selectedPath}
        baudRate={baudRate}
        onPathChange={setSelectedPath}
        onBaudChange={setBaudRate}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onRefresh={onRefresh}
      />

      <div ref={scrollRef} className="bg-gray-900 rounded p-2 h-48 overflow-y-auto font-mono text-xs leading-relaxed">
        {lines.length === 0 ? (
          <div className="text-gray-600 italic">Keine Daten empfangen…</div>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="text-green-400 break-all">{line}</div>
          ))
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-400">
        <label className="flex items-center gap-1 cursor-pointer select-none">
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} className="accent-green-500" />
          Auto-Scroll
        </label>
        <span className="text-gray-600">{lines.length}/{MAX_LINES} Zeilen</span>
        <button onClick={onClear} className="ml-auto flex items-center gap-1 px-2 py-0.5 bg-gray-700 hover:bg-gray-600 rounded">
          <Trash2 className="w-3 h-3" /> Löschen
        </button>
      </div>
    </div>
  );
};

export default LoraTerminal;
