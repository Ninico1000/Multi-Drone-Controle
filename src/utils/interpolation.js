export const interpolate = (kf1, kf2, t, mode = 'smooth') => {
  const s = mode === 'smooth' ? t * t * (3 - 2 * t) : t;
  const lerp = (a, b) => a + (b - a) * s;
  return {
    x: lerp(kf1.x, kf2.x),
    y: lerp(kf1.y, kf2.y),
    z: lerp(kf1.z, kf2.z),
    r: lerp(kf1.r ?? 255, kf2.r ?? 255),
    g: lerp(kf1.g ?? 255, kf2.g ?? 255),
    b: lerp(kf1.b ?? 255, kf2.b ?? 255),
    // color fn/fp taken from upcoming keyframe (no interpolation)
    colorFn: kf2.colorFn ?? 0,
    colorFp: kf2.colorFp ?? 0,
  };
};

export const createFormationPositions = (formationType, droneCount, radius = 5) => {
  const positions = [];

  for (let index = 0; index < droneCount; index++) {
    let x, y, z;

    if (formationType === 'circle') {
      const angle = (index / droneCount) * Math.PI * 2;
      x = Math.cos(angle) * radius;
      y = Math.sin(angle) * radius;
      z = 3;
    } else if (formationType === 'line') {
      x = index * 3 - droneCount * 1.5;
      y = 0;
      z = 3;
    } else if (formationType === 'triangle') {
      const angle = (index / droneCount) * Math.PI * 2;
      x = Math.cos(angle) * radius;
      y = Math.sin(angle) * radius;
      z = index * 0.5 + 3;
    }

    positions.push({ x, y, z });
  }

  return positions;
};
