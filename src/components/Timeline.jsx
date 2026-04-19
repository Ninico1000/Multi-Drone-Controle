import React, { useRef, useCallback, useState } from 'react';
import { Plus } from 'lucide-react';

const Timeline = ({
  keyframes, drones, playbackTime, isPlaying,
  selectedKeyframe, setSelectedKeyframe,
  onSeek, updateKeyframe,
  maxTimeSetting, setMaxTimeSetting,
}) => {
  const kfMaxTime = keyframes.length > 0 ? Math.max(...keyframes.map(k => k.time)) : 0;
  const maxTime = Math.max(maxTimeSetting, kfMaxTime);

  const barRef = useRef(null);
  const isScrubbing = useRef(false);
  const draggingKf = useRef(null);
  const [dragKfId, setDragKfId] = useState(null);

  const getTimeFromX = useCallback((clientX) => {
    const bar = barRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return parseFloat((ratio * maxTime).toFixed(2));
  }, [maxTime]);

  const handleBarMouseDown = useCallback((e) => {
    if (isPlaying || draggingKf.current) return;
    isScrubbing.current = true;
    onSeek && onSeek(getTimeFromX(e.clientX));
  }, [isPlaying, getTimeFromX, onSeek]);

  const handleKfMouseDown = useCallback((e, kfId) => {
    e.stopPropagation();
    if (isPlaying) return;
    setSelectedKeyframe(kfId);
    draggingKf.current = { id: kfId };
    setDragKfId(kfId);
  }, [isPlaying, setSelectedKeyframe]);

  const handleMouseMove = useCallback((e) => {
    const t = getTimeFromX(e.clientX);
    if (draggingKf.current) {
      const clamped = Math.max(0, t);
      updateKeyframe && updateKeyframe(draggingKf.current.id, 'time', clamped);
      onSeek && onSeek(clamped);
      return;
    }
    if (isScrubbing.current && !isPlaying) {
      onSeek && onSeek(t);
    }
  }, [getTimeFromX, isPlaying, onSeek, updateKeyframe]);

  const handleMouseUp = useCallback(() => {
    isScrubbing.current = false;
    draggingKf.current = null;
    setDragKfId(null);
  }, []);

  const laneHeight = Math.max(3, drones.length) * 16;
  const tickCount = Math.min(13, Math.floor(maxTime / 5) + 1);

  return (
    <div
      className="mt-4 bg-gray-700 rounded p-3 select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <span className="text-sm font-semibold">Timeline</span>
        <span className="text-sm text-gray-400">
          {playbackTime.toFixed(1)}s / {maxTime.toFixed(0)}s
        </span>

        {/* Duration control */}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-gray-400">Dauer:</span>
          <input
            type="number"
            value={maxTimeSetting}
            min={10}
            step={10}
            onChange={e => setMaxTimeSetting(Math.max(10, parseInt(e.target.value) || 60))}
            className="w-16 bg-gray-600 text-white text-xs rounded px-2 py-0.5 text-center"
          />
          <span className="text-xs text-gray-400">s</span>
          <button
            onClick={() => setMaxTimeSetting(v => v + 30)}
            className="bg-gray-600 hover:bg-gray-500 rounded px-1.5 py-0.5 text-xs flex items-center"
            title="+30s"
          >
            <Plus className="w-3 h-3" />30s
          </button>
        </div>

        {!isPlaying && (
          <span className="text-xs text-gray-500">klicken · KF ziehen</span>
        )}
      </div>

      {/* Timeline bar */}
      <div
        ref={barRef}
        className={`relative bg-gray-800 rounded overflow-hidden ${!isPlaying ? 'cursor-crosshair' : 'cursor-default'}`}
        style={{ height: `${laneHeight}px` }}
        onMouseDown={handleBarMouseDown}
      >
        {/* Lane backgrounds */}
        {drones.map((drone, i) => (
          <div
            key={drone.id}
            className="absolute left-0 right-0"
            style={{
              top: `${(i / drones.length) * 100}%`,
              height: `${100 / drones.length}%`,
              backgroundColor: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
            }}
          />
        ))}

        {/* Keyframe markers */}
        {keyframes.map(kf => {
          const drone = drones.find(d => d.id === kf.droneId);
          const droneIndex = drones.findIndex(d => d.id === kf.droneId);
          const laneH = 100 / Math.max(drones.length, 1);
          const left = (kf.time / maxTime) * 100;
          const top = droneIndex >= 0 ? droneIndex * laneH : 0;
          const color = drone ? `#${drone.color.toString(16).padStart(6, '0')}` : '#888';
          const isDragging = dragKfId === kf.id;
          const isSelected = selectedKeyframe === kf.id;

          return (
            <div
              key={kf.id}
              onMouseDown={e => handleKfMouseDown(e, kf.id)}
              className={`absolute cursor-ew-resize ${isSelected ? 'opacity-100' : 'opacity-70 hover:opacity-100'}`}
              style={{
                left: `calc(${left}% - 4px)`,
                top: `${top}%`,
                height: `${laneH}%`,
                width: '8px',
                backgroundColor: color,
                boxShadow: isSelected ? '0 0 0 2px white' : isDragging ? `0 0 0 1px ${color}` : 'none',
                zIndex: isDragging ? 10 : 1,
              }}
              title={`${drone?.name} @ ${kf.time.toFixed(1)}s`}
            />
          );
        })}

        {/* Cursor */}
        <div
          className={`absolute top-0 w-px h-full pointer-events-none ${isPlaying ? 'bg-yellow-400' : 'bg-white opacity-70'}`}
          style={{ left: `${(playbackTime / maxTime) * 100}%` }}
        />
        <div
          className="absolute top-0.5 text-white bg-gray-900 rounded pointer-events-none px-0.5"
          style={{ left: `${(playbackTime / maxTime) * 100}%`, transform: 'translateX(-50%)', fontSize: '9px' }}
        >
          {playbackTime.toFixed(1)}s
        </div>
      </div>

      {/* Time axis */}
      <div className="relative h-4 mt-1">
        {Array.from({ length: tickCount }).map((_, i) => {
          const t = (i / (tickCount - 1)) * maxTime;
          return (
            <div
              key={i}
              className="absolute text-gray-500 text-xs"
              style={{ left: `${(t / maxTime) * 100}%`, transform: 'translateX(-50%)' }}
            >
              {t.toFixed(0)}s
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Timeline;
