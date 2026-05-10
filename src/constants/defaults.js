export const INITIAL_DRONES = [
  {
    id: 1,
    name: 'Drohne-01',
    ip: '192.168.1.101',
    connected: false,
    battery: 100,
    color: 0xff0000,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    targetReached: false
  },
  {
    id: 2,
    name: 'Drohne-02',
    ip: '192.168.1.102',
    connected: false,
    battery: 95,
    color: 0x00ff00,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    targetReached: false
  },
  {
    id: 3,
    name: 'Drohne-03',
    ip: '192.168.1.103',
    connected: false,
    battery: 88,
    color: 0x0000ff,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    targetReached: false
  },
];

export const SCENE_CONFIG = {
  gridSize: 25,
  backgroundColor: 0x1a1a2e,
  cameraPosition: { x: 20, y: 20, z: 20 },
};

export const DRONE_COLORS = [
  0xff0000, 0x00ff00, 0x0000ff, 0xffff00,
  0xff00ff, 0x00ffff, 0xff8800, 0x8800ff,
  0x00ff88, 0xff0088,
];
