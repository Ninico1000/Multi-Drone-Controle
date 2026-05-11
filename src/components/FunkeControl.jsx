import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Gamepad2, Play, Square, AlertCircle, PlaneLanding } from 'lucide-react';
import droneConnection from '../utils/droneConnection';

const CH_CONFIG = [
  { label: 'Roll',  color: '#3b82f6' },
  { label: 'Pitch', color: '#22c55e' },
  { label: 'Gier',  color: '#eab308' },
  { label: 'Gas',   color: '#ef4444' },
  { label: 'CH5',   color: '#8b5cf6' },
  { label: 'CH6',   color: '#06b6d4' },
  { label: 'CH7',   color: '#f97316' },
  { label: 'CH8',   color: '#ec4899' },
];

// Jumper T2 Pro: axes[0]=RX(roll), axes[1]=RY(pitch), axes[2]=LX(yaw), axes[3]=LY(throttle, inverted)
const axisToChannel = (gp) => {
  const a = gp.axes;
  const b = gp.buttons;
  return [
    Math.round(1500 + (a[0] ?? 0) * 500),
    Math.round(1500 + (a[1] ?? 0) * 500),
    Math.round(1500 + (a[2] ?? 0) * 500),
    Math.round(1500 - (a[3] ?? 0) * 500),
    b[4]?.pressed ? 2000 : 1000,
    b[5]?.pressed ? 2000 : 1000,
    1500,
    1500,
  ];
};

const DRONE_CMDS = [
  { label: 'ARM',     Icon: Play,         cls: 'bg-green-700 hover:bg-green-600',   payload: () => ({ cmd: 'arm', arm: 1, thr: 1000, r: 0, p: 0, y: 0, mode: 1 }) },
  { label: 'DISARM',  Icon: Square,       cls: 'bg-yellow-700 hover:bg-yellow-600', payload: () => ({ cmd: 'arm', arm: 0 }) },
  { label: 'Landen',  Icon: PlaneLanding, cls: 'bg-blue-700 hover:bg-blue-600',     payload: () => ({ cmd: 'land', seq: Date.now() }) },
  { label: 'NOT-AUS', Icon: AlertCircle,  cls: 'bg-red-700 hover:bg-red-600',       payload: () => ({ cmd: 'emergency', seq: Date.now() }) },
];

function ChannelBar({ label, value, color }) {
  const pct = ((value - 1000) / 1000) * 100;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-8 text-gray-400 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
        <div
          className="h-2 rounded-full transition-all duration-75"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-10 text-right text-gray-300 font-mono">{value}</span>
    </div>
  );
}

const FunkeControl = ({ drones = [], selectedDroneId, onSelectDrone, bridgeConnected, addLog }) => {
  const [gamepadIndex, setGamepadIndex] = useState(null);
  const [channels, setChannels] = useState(Array(8).fill(1500));
  const [autoForward, setAutoForward] = useState(false);
  const autoForwardRef = useRef(autoForward);
  const selectedDroneRef = useRef(selectedDroneId);
  const gamepadIndexRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => { autoForwardRef.current = autoForward; }, [autoForward]);
  useEffect(() => { selectedDroneRef.current = selectedDroneId; }, [selectedDroneId]);
  useEffect(() => { gamepadIndexRef.current = gamepadIndex; }, [gamepadIndex]);

  useEffect(() => {
    const onConnect = (e) => {
      setGamepadIndex(e.gamepad.index);
      addLog && addLog('Gamepad erkannt: ' + e.gamepad.id);
    };
    const onDisconnect = (e) => {
      if (e.gamepad.index === gamepadIndexRef.current) {
        setGamepadIndex(null);
        setChannels(Array(8).fill(1500));
        addLog && addLog('Gamepad getrennt');
      }
    };
    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);
    const existing = navigator.getGamepads();
    for (const gp of existing) {
      if (gp) { setGamepadIndex(gp.index); break; }
    }
    return () => {
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
    };
  }, []);

  useEffect(() => {
    if (gamepadIndex === null) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(() => {
      const gp = navigator.getGamepads()[gamepadIndex];
      if (!gp) return;
      const ch = axisToChannel(gp);
      setChannels(prev => prev.every((v, i) => v === ch[i]) ? prev : ch);
      if (autoForwardRef.current && selectedDroneRef.current && bridgeConnected) {
        droneConnection.sendFunkeToDrone(selectedDroneRef.current, ch).catch(() => {});
      }
    }, 20);
    return () => clearInterval(pollRef.current);
  }, [gamepadIndex, bridgeConnected]);

  const sendCmd = useCallback((payload) => {
    const drone = drones.find(d => d.id === selectedDroneId);
    if (!drone || !bridgeConnected) return;
    droneConnection.send(drone.ip, payload).catch(() => {});
  }, [drones, selectedDroneId, bridgeConnected]);

  const handleSelectDrone = useCallback((id) => {
    const numId = id ? parseInt(id, 10) : null;
    onSelectDrone && onSelectDrone(numId);
    if (numId) {
      const drone = drones.find(d => d.id === numId);
      if (drone && bridgeConnected) {
        droneConnection.send(drone.ip, { cmd: 'mode', mode: 1 }).catch(() => {});
        addLog && addLog('Funke → Drohne ' + drone.name + ' (STABILIZE)');
      }
    }
  }, [drones, bridgeConnected, onSelectDrone, addLog]);

  const gamepadDetected = gamepadIndex !== null;
  const cmdDisabled = !selectedDroneId || !bridgeConnected;

  return (
    <div className="bg-gray-800 rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Gamepad2 className="w-5 h-5 text-purple-400" />
          Funke / RC Controller
        </h2>
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${gamepadDetected ? 'bg-purple-700' : 'bg-gray-600'}`}>
          {gamepadDetected ? 'Gamepad erkannt' : 'Kein Gamepad'}
        </span>
      </div>

      {!gamepadDetected && (
        <div className="bg-gray-700 rounded p-3 text-xs text-gray-400">
          Jumper T2 Pro per USB anschließen und in EdgeTX den USB-Modus
          <strong className="text-white"> USB Joystick</strong> auswählen.
          Danach wird er hier automatisch erkannt.
        </div>
      )}

      <div>
        <label className="text-xs text-gray-400 block mb-1">Ziel-Drohne:</label>
        <select
          value={selectedDroneId ?? ''}
          onChange={e => handleSelectDrone(e.target.value || null)}
          className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
        >
          <option value="">-- Keine Drohne --</option>
          {drones.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <div className="text-xs text-gray-400 mb-1">RC Kanäle (µs)</div>
        {CH_CONFIG.map((cfg, i) => (
          <ChannelBar key={i} label={cfg.label} value={channels[i]} color={cfg.color} />
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <input
          type="checkbox"
          checked={autoForward}
          onChange={e => setAutoForward(e.target.checked)}
          disabled={!gamepadDetected || !selectedDroneId}
          className="accent-purple-500"
        />
        <span className={autoForward ? 'text-purple-300 font-medium' : 'text-gray-400'}>
          Auto-Weiterleiten {autoForward ? '(aktiv)' : ''}
        </span>
      </label>

      <div className="grid grid-cols-2 gap-2">
        {DRONE_CMDS.map(({ label, Icon, cls, payload }) => (
          <button
            key={label}
            onClick={() => sendCmd(payload())}
            disabled={cmdDisabled}
            className={`${cls} disabled:bg-gray-600 py-1.5 rounded text-xs flex items-center justify-center gap-1`}
          >
            <Icon className="w-3 h-3" /> {label}
          </button>
        ))}
      </div>

      <div className="text-xs text-gray-500">
        Achsen: Links=Yaw/Gas · Rechts=Roll/Pitch · CH5/CH6=Buttons 4/5
      </div>
    </div>
  );
};

export default FunkeControl;
