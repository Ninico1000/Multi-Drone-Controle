import React, { useState, useRef } from 'react';
import { Wifi, WifiOff, Plus, Target, Play, Square, AlertCircle, Radio, Search, UserPlus, X, Check, GripVertical } from 'lucide-react';

const DronePanel = ({
  drones,
  toggleConnection,
  addKeyframe,
  uploadMissionToDrone,
  startMissionOnDrone,
  stopMissionOnDrone,
  emergencyStopDrone,
  bridgeConnected,
  discoverDrones,
  onAddDrone,
  onReorderDrones,
}) => {
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

  const handleDragStart = (e, index) => {
    dragIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = (e, index) => {
    e.preventDefault();
    if (dragIndex.current === null || dragIndex.current === index) {
      setDragOverIndex(null);
      return;
    }
    const reordered = [...drones];
    const [moved] = reordered.splice(dragIndex.current, 1);
    reordered.splice(index, 0, moved);
    onReorderDrones && onReorderDrones(reordered);
    dragIndex.current = null;
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    dragIndex.current = null;
    setDragOverIndex(null);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Wifi className="w-5 h-5" />
            Drohnen
          </h2>
          <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${bridgeConnected ? 'bg-green-600' : 'bg-red-600'}`}>
            <Radio className="w-3 h-3" />
            {bridgeConnected ? 'Bridge OK' : 'No Bridge'}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={discoverDrones}
            className="flex-1 bg-blue-600 hover:bg-blue-700 py-1 rounded text-xs flex items-center justify-center gap-1"
            disabled={!bridgeConnected}
          >
            <Search className="w-3 h-3" /> Suchen
          </button>
          <button
            onClick={() => setShowAddForm(v => !v)}
            className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${showAddForm ? 'bg-gray-600' : 'bg-teal-600 hover:bg-teal-700'}`}
            title="Drohne manuell hinzufügen"
          >
            <UserPlus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Add drone form */}
      {showAddForm && (
        <div className="bg-gray-700 rounded p-2 mb-3 space-y-2">
          <div className="text-xs font-medium text-teal-300">Neue Drohne hinzufügen</div>
          <input
            type="text"
            placeholder="Name (z.B. Drohne-04)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full bg-gray-600 text-white text-xs rounded px-2 py-1"
          />
          <input
            type="text"
            placeholder="IP-Adresse (z.B. 192.168.1.104)"
            value={newIp}
            onChange={e => setNewIp(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddDrone()}
            className="w-full bg-gray-600 text-white text-xs rounded px-2 py-1"
          />
          <div className="flex gap-1">
            <button
              onClick={handleAddDrone}
              disabled={!newIp.trim()}
              className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-600 py-1 rounded text-xs flex items-center justify-center gap-1"
            >
              <Check className="w-3 h-3" /> Hinzufügen
            </button>
            <button
              onClick={() => { setShowAddForm(false); setNewName(''); setNewIp(''); }}
              className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {drones.map((drone, index) => (
          <div
            key={drone.id}
            draggable
            onDragStart={e => handleDragStart(e, index)}
            onDragOver={e => handleDragOver(e, index)}
            onDrop={e => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className={`bg-gray-700 rounded p-2 transition-all ${dragOverIndex === index ? 'ring-2 ring-blue-400 opacity-80' : ''}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <GripVertical className="w-3 h-3 text-gray-500 cursor-grab flex-shrink-0" />
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: `#${drone.color.toString(16).padStart(6, '0')}` }}
                />
                <span className="font-semibold text-sm truncate">{drone.name}</span>
              </div>
              <button
                onClick={() => toggleConnection(drone.id)}
                className={`p-1 rounded flex-shrink-0 ${drone.connected ? 'bg-green-600' : 'bg-red-600'}`}
              >
                {drone.connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              </button>
            </div>
            <div className="text-xs text-gray-300 mb-2">
              <div>IP: {drone.ip}</div>
              <div>Pos: ({drone.x.toFixed(1)}, {drone.y.toFixed(1)}, {drone.z.toFixed(1)})</div>
            </div>

            <div className="flex gap-1 mb-1">
              <button
                onClick={() => addKeyframe(drone.id)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 py-1 rounded text-xs flex items-center justify-center gap-1"
              >
                <Plus className="w-3 h-3" /> KF
              </button>
              <button
                onClick={() => uploadMissionToDrone(drone.id)}
                className="flex-1 bg-green-600 hover:bg-green-700 py-1 rounded text-xs flex items-center justify-center gap-1"
                disabled={!bridgeConnected}
              >
                <Target className="w-3 h-3" /> Upload
              </button>
            </div>

            <div className="flex gap-1">
              <button
                onClick={() => startMissionOnDrone(drone.id)}
                className="flex-1 bg-green-700 hover:bg-green-800 py-1 rounded text-xs flex items-center justify-center gap-1"
                disabled={!drone.connected || !bridgeConnected}
              >
                <Play className="w-3 h-3" /> Start
              </button>
              <button
                onClick={() => stopMissionOnDrone(drone.id)}
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 py-1 rounded text-xs flex items-center justify-center gap-1"
                disabled={!drone.connected || !bridgeConnected}
              >
                <Square className="w-3 h-3" /> Stop
              </button>
              <button
                onClick={() => emergencyStopDrone(drone.id)}
                className="flex-1 bg-red-600 hover:bg-red-700 py-1 rounded text-xs flex items-center justify-center gap-1"
                disabled={!bridgeConnected}
              >
                <AlertCircle className="w-3 h-3" /> E-Stop
              </button>
            </div>
          </div>
        ))}

        {drones.length === 0 && (
          <div className="text-center text-gray-500 text-xs py-4">
            Keine Drohnen. Suchen oder manuell hinzufügen.
          </div>
        )}
      </div>
    </div>
  );
};

export default DronePanel;
