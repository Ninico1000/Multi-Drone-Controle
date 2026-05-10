import React from 'react';
import { RefreshCw, Plug, Unplug } from 'lucide-react';

const BAUD_RATES = [9600, 19200, 57600, 115200, 921600];

const PortSelector = ({
  ports = [],
  connected,
  selectedPath,
  baudRate = 115200,
  onPathChange,
  onBaudChange,
  onConnect,
  onDisconnect,
  onRefresh,
  disabled = false,
}) => (
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
      <button
        onClick={onDisconnect}
        disabled={disabled}
        className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs flex items-center gap-1 disabled:opacity-40"
      >
        <Unplug className="w-3 h-3" /> Trennen
      </button>
    ) : (
      <button
        onClick={() => onConnect && onConnect(selectedPath, baudRate)}
        disabled={!selectedPath || disabled}
        className="px-2 py-1 bg-green-700 hover:bg-green-600 rounded text-xs flex items-center gap-1 disabled:opacity-40"
      >
        <Plug className="w-3 h-3" /> Verbinden
      </button>
    )}
  </div>
);

export default PortSelector;
