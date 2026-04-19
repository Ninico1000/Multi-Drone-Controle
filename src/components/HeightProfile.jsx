import React, { useMemo } from 'react';
import { interpolate } from '../utils/interpolation';

const HeightProfile = ({ keyframes, drones, playbackTime, interpolationMode, maxTime }) => {
  const WIDTH = 600;
  const HEIGHT = 140;
  const PAD = { top: 10, right: 10, bottom: 24, left: 36 };
  const chartW = WIDTH - PAD.left - PAD.right;
  const chartH = HEIGHT - PAD.top - PAD.bottom;

  const STEPS = 120;

  // Compute interpolated paths per drone
  const paths = useMemo(() => {
    return drones.map(drone => {
      const dkf = keyframes
        .filter(kf => kf.droneId === drone.id)
        .sort((a, b) => a.time - b.time);

      if (dkf.length === 0) return null;

      const points = [];
      for (let i = 0; i <= STEPS; i++) {
        const t = (i / STEPS) * maxTime;
        let kf1 = dkf[0];
        let kf2 = dkf[dkf.length - 1];
        for (let j = 0; j < dkf.length - 1; j++) {
          if (dkf[j].time <= t && dkf[j + 1].time >= t) {
            kf1 = dkf[j];
            kf2 = dkf[j + 1];
            break;
          }
        }
        const alpha = kf2.time > kf1.time
          ? Math.max(0, Math.min(1, (t - kf1.time) / (kf2.time - kf1.time)))
          : 0;
        const pos = interpolate(kf1, kf2, alpha, interpolationMode);
        points.push({ t, z: pos.z });
      }
      return { drone, points, keyframes: dkf };
    }).filter(Boolean);
  }, [keyframes, drones, maxTime, interpolationMode]);

  // Z range
  const allZ = paths.flatMap(p => p.points.map(pt => pt.z));
  const minZ = Math.min(0, ...allZ);
  const maxZ = Math.max(1, ...allZ);
  const zRange = maxZ - minZ || 1;

  const toX = (t) => PAD.left + (t / maxTime) * chartW;
  const toY = (z) => PAD.top + chartH - ((z - minZ) / zRange) * chartH;

  const colorOf = (drone) => `#${drone.color.toString(16).padStart(6, '0')}`;

  // Time axis ticks
  const timeTicks = Array.from({ length: 7 }, (_, i) => (i / 6) * maxTime);
  // Z axis ticks
  const zTicks = Array.from({ length: 5 }, (_, i) => minZ + (i / 4) * zRange);

  return (
    <div className="bg-gray-800 rounded-lg p-3">
      <div className="text-sm font-semibold mb-2 text-gray-300">Höhenprofil</div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        style={{ height: `${HEIGHT}px` }}
      >
        {/* Grid lines */}
        {zTicks.map((z, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={toY(z)}
              x2={PAD.left + chartW} y2={toY(z)}
              stroke="#374151" strokeWidth="1"
            />
            <text
              x={PAD.left - 4} y={toY(z) + 4}
              textAnchor="end" fontSize="9" fill="#6b7280"
            >
              {z.toFixed(1)}m
            </text>
          </g>
        ))}

        {/* Ground line */}
        <line
          x1={PAD.left} y1={toY(0)}
          x2={PAD.left + chartW} y2={toY(0)}
          stroke="#4b5563" strokeWidth="1.5" strokeDasharray="4,2"
        />

        {/* Flight paths */}
        {paths.map(({ drone, points }) => {
          const d = points.map((pt, i) =>
            `${i === 0 ? 'M' : 'L'} ${toX(pt.t).toFixed(1)} ${toY(pt.z).toFixed(1)}`
          ).join(' ');
          return (
            <path
              key={drone.id}
              d={d}
              fill="none"
              stroke={colorOf(drone)}
              strokeWidth="1.5"
              opacity="0.9"
            />
          );
        })}

        {/* Keyframe dots */}
        {paths.map(({ drone, keyframes: dkf }) =>
          dkf.map(kf => (
            <circle
              key={kf.id}
              cx={toX(kf.time)}
              cy={toY(kf.z)}
              r="3"
              fill={colorOf(drone)}
              stroke="white"
              strokeWidth="1"
            />
          ))
        )}

        {/* Playback cursor */}
        <line
          x1={toX(playbackTime)} y1={PAD.top}
          x2={toX(playbackTime)} y2={PAD.top + chartH}
          stroke="white" strokeWidth="1" opacity="0.6"
        />

        {/* Time axis */}
        {timeTicks.map((t, i) => (
          <text
            key={i}
            x={toX(t)} y={HEIGHT - 4}
            textAnchor="middle" fontSize="9" fill="#6b7280"
          >
            {t.toFixed(0)}s
          </text>
        ))}

        {/* Border */}
        <rect
          x={PAD.left} y={PAD.top}
          width={chartW} height={chartH}
          fill="none" stroke="#374151" strokeWidth="1"
        />
      </svg>

      {/* Legend */}
      <div className="flex gap-3 mt-1 flex-wrap">
        {drones.map(d => (
          <div key={d.id} className="flex items-center gap-1 text-xs text-gray-400">
            <div className="w-3 h-0.5 rounded" style={{ backgroundColor: colorOf(d) }} />
            {d.name}
          </div>
        ))}
      </div>
    </div>
  );
};

export default HeightProfile;
