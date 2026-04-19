export const interpolate = (kf1, kf2, t, mode = 'smooth') => {
  if (mode === 'linear') {
    return {
      x: kf1.x + (kf2.x - kf1.x) * t,
      y: kf1.y + (kf2.y - kf1.y) * t,
      z: kf1.z + (kf2.z - kf1.z) * t,
      yaw: kf1.yaw + (kf2.yaw - kf1.yaw) * t,
      pitch: kf1.pitch + (kf2.pitch - kf1.pitch) * t,
      roll: kf1.roll + (kf2.roll - kf1.roll) * t,
    };
  } else if (mode === 'smooth') {
    const smoothT = t * t * (3 - 2 * t);
    return {
      x: kf1.x + (kf2.x - kf1.x) * smoothT,
      y: kf1.y + (kf2.y - kf1.y) * smoothT,
      z: kf1.z + (kf2.z - kf1.z) * smoothT,
      yaw: kf1.yaw + (kf2.yaw - kf1.yaw) * smoothT,
      pitch: kf1.pitch + (kf2.pitch - kf1.pitch) * smoothT,
      roll: kf1.roll + (kf2.roll - kf1.roll) * smoothT,
    };
  }
  return kf1;
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
