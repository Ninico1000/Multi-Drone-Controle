import React from 'react';
import { Eye, EyeOff, Trash2, Target, X, Move } from 'lucide-react';

const ModelControls = ({
  modelFileName,
  showModel,
  setShowModel,
  modelScale,
  setModelScale,
  modelPosition,
  setModelPosition,
  modelVertices,
  selectedVertices,
  onClearSelection,
  onAssignToDrones,
  onClearModel,
  modelGizmoEnabled,
  onToggleModelGizmo,
}) => {
  const handlePositionChange = (axis, value) => {
    setModelPosition(prev => ({
      ...prev,
      [axis]: parseFloat(value) || 0
    }));
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">3D Modell</h3>
        <button
          onClick={onClearModel}
          className="text-red-400 hover:text-red-300 p-1"
          title="Modell entfernen"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* File Name */}
      <div className="text-sm text-gray-400 mb-3 truncate" title={modelFileName}>
        {modelFileName}
      </div>

      {/* Visibility + Gizmo Toggles */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <span className="text-sm">Sichtbarkeit</span>
        <div className="flex gap-2">
          <button
            onClick={onToggleModelGizmo}
            className={'p-2 rounded flex items-center gap-1 text-xs ' + (modelGizmoEnabled ? 'bg-blue-600' : 'bg-gray-600')}
            title={modelGizmoEnabled ? 'Bewegen deaktivieren (Vertex-Auswahl)' : 'Modell verschieben aktivieren'}
          >
            <Move className="w-4 h-4" />
            {modelGizmoEnabled ? 'Verschieben' : 'Verschieben'}
          </button>
          <button
            onClick={() => setShowModel(!showModel)}
            className={'p-2 rounded ' + (showModel ? 'bg-green-600' : 'bg-gray-600')}
          >
            {showModel ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Scale Slider */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm">Skalierung</span>
          <span className="text-sm text-gray-400">{modelScale.toFixed(1)}x</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="10"
          step="0.1"
          value={modelScale}
          onChange={(e) => setModelScale(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Position Controls */}
      <div className="mb-3">
        <span className="text-sm block mb-2">Position Offset</span>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-gray-400">X</label>
            <input
              type="number"
              step="0.5"
              value={modelPosition.x}
              onChange={(e) => handlePositionChange('x', e.target.value)}
              className="w-full bg-gray-700 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Y</label>
            <input
              type="number"
              step="0.5"
              value={modelPosition.y}
              onChange={(e) => handlePositionChange('y', e.target.value)}
              className="w-full bg-gray-700 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Z</label>
            <input
              type="number"
              step="0.5"
              value={modelPosition.z}
              onChange={(e) => handlePositionChange('z', e.target.value)}
              className="w-full bg-gray-700 rounded px-2 py-1 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Vertex Info */}
      <div className="border-t border-gray-700 pt-3 mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm">Vertices</span>
          <span className="text-sm text-cyan-400">{modelVertices.length}</span>
        </div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm">Ausgewählt</span>
          <span className="text-sm text-yellow-400">{selectedVertices.length}</span>
        </div>
      </div>

      {/* Selected Vertices List */}
      {selectedVertices.length > 0 && (
        <div className="mb-3 max-h-32 overflow-y-auto bg-gray-900 rounded p-2">
          <div className="text-xs text-gray-400 mb-1">Ausgewählte Vertices:</div>
          {selectedVertices.slice(0, 10).map((idx) => {
            const v = modelVertices[idx];
            if (!v) return null;
            return (
              <div key={idx} className="text-xs text-gray-300">
                #{idx}: ({v.x.toFixed(2)}, {v.y.toFixed(2)}, {v.z.toFixed(2)})
              </div>
            );
          })}
          {selectedVertices.length > 10 && (
            <div className="text-xs text-gray-500">
              ...und {selectedVertices.length - 10} weitere
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2">
        {selectedVertices.length > 0 && (
          <>
            <button
              onClick={onClearSelection}
              className="w-full bg-gray-600 hover:bg-gray-500 px-3 py-2 rounded text-sm flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Auswahl löschen
            </button>
            <button
              onClick={onAssignToDrones}
              className="w-full bg-green-600 hover:bg-green-500 px-3 py-2 rounded text-sm flex items-center justify-center gap-2"
            >
              <Target className="w-4 h-4" />
              Zu Drohnen zuweisen
            </button>
          </>
        )}
      </div>

      {/* Help Text */}
      <div className="mt-3 text-xs text-gray-500">
        {modelGizmoEnabled
          ? 'Verschiebe-Modus aktiv — Klicke "Verschieben" zum Deaktivieren für Vertex-Auswahl.'
          : 'Klicke auf Vertices im 3D-View zum Auswählen. Shift+Klick für Mehrfachauswahl.'}
      </div>
    </div>
  );
};

export default ModelControls;
