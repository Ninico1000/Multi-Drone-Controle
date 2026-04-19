/**
 * Utility functions for 3D model vertex extraction and processing
 */

/**
 * Extract unique vertices from a Three.js BufferGeometry
 * @param {THREE.BufferGeometry} geometry - The geometry to extract vertices from
 * @returns {Array<{x: number, y: number, z: number, index: number}>} Array of unique vertices
 */
export const extractVertices = (geometry) => {
  const positions = geometry.attributes.position;
  if (!positions) return [];

  const vertices = [];
  const seen = new Set();

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);

    // Create a key with 3 decimal places precision to avoid floating point duplicates
    const key = x.toFixed(3) + ',' + y.toFixed(3) + ',' + z.toFixed(3);

    if (!seen.has(key)) {
      seen.add(key);
      vertices.push({
        x,
        y,
        z,
        index: vertices.length
      });
    }
  }

  return vertices;
};

/**
 * Extract vertices from a Three.js Object3D (recursively processes all meshes)
 * @param {THREE.Object3D} object - The 3D object to extract vertices from
 * @returns {Array<{x: number, y: number, z: number, index: number}>} Array of unique vertices
 */
export const extractVerticesFromObject = (object) => {
  const allVertices = [];
  const seen = new Set();

  object.traverse((child) => {
    if (child.isMesh && child.geometry) {
      // Get world matrix to transform local vertices to world space
      child.updateWorldMatrix(true, false);
      const worldMatrix = child.matrixWorld;

      const positions = child.geometry.attributes.position;
      if (!positions) return;

      for (let i = 0; i < positions.count; i++) {
        // Get local position
        let x = positions.getX(i);
        let y = positions.getY(i);
        let z = positions.getZ(i);

        // Transform to world space using the mesh's world matrix
        const vertex = { x, y, z };
        const transformed = transformVertex(vertex, worldMatrix);

        const key = transformed.x.toFixed(3) + ',' + transformed.y.toFixed(3) + ',' + transformed.z.toFixed(3);

        if (!seen.has(key)) {
          seen.add(key);
          allVertices.push({
            x: transformed.x,
            y: transformed.y,
            z: transformed.z,
            index: allVertices.length
          });
        }
      }
    }
  });

  return allVertices;
};

/**
 * Transform a vertex by a 4x4 matrix
 * @param {{x: number, y: number, z: number}} vertex - The vertex to transform
 * @param {THREE.Matrix4} matrix - The transformation matrix
 * @returns {{x: number, y: number, z: number}} Transformed vertex
 */
const transformVertex = (vertex, matrix) => {
  const e = matrix.elements;
  const x = vertex.x, y = vertex.y, z = vertex.z;
  const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);

  return {
    x: (e[0] * x + e[4] * y + e[8] * z + e[12]) * w,
    y: (e[1] * x + e[5] * y + e[9] * z + e[13]) * w,
    z: (e[2] * x + e[6] * y + e[10] * z + e[14]) * w
  };
};

/**
 * Simplify vertices by merging close points
 * @param {Array<{x: number, y: number, z: number, index: number}>} vertices - Vertices to simplify
 * @param {number} threshold - Distance threshold for merging (default 0.1)
 * @returns {Array<{x: number, y: number, z: number, index: number}>} Simplified vertices
 */
export const simplifyVertices = (vertices, threshold = 0.1) => {
  if (vertices.length === 0) return [];

  const simplified = [];
  const used = new Set();

  for (let i = 0; i < vertices.length; i++) {
    if (used.has(i)) continue;

    const v1 = vertices[i];
    const cluster = [v1];

    // Find all vertices within threshold distance
    for (let j = i + 1; j < vertices.length; j++) {
      if (used.has(j)) continue;

      const v2 = vertices[j];
      const dist = Math.sqrt(
        Math.pow(v1.x - v2.x, 2) +
        Math.pow(v1.y - v2.y, 2) +
        Math.pow(v1.z - v2.z, 2)
      );

      if (dist < threshold) {
        cluster.push(v2);
        used.add(j);
      }
    }

    // Calculate centroid of cluster
    const centroid = {
      x: cluster.reduce((sum, v) => sum + v.x, 0) / cluster.length,
      y: cluster.reduce((sum, v) => sum + v.y, 0) / cluster.length,
      z: cluster.reduce((sum, v) => sum + v.z, 0) / cluster.length,
      index: simplified.length
    };

    simplified.push(centroid);
    used.add(i);
  }

  return simplified;
};

/**
 * Get bounding box of vertices
 * @param {Array<{x: number, y: number, z: number}>} vertices - Array of vertices
 * @returns {{min: {x, y, z}, max: {x, y, z}, center: {x, y, z}, size: {x, y, z}}}
 */
export const getVerticesBoundingBox = (vertices) => {
  if (vertices.length === 0) {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
      center: { x: 0, y: 0, z: 0 },
      size: { x: 0, y: 0, z: 0 }
    };
  }

  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };

  vertices.forEach(v => {
    min.x = Math.min(min.x, v.x);
    min.y = Math.min(min.y, v.y);
    min.z = Math.min(min.z, v.z);
    max.x = Math.max(max.x, v.x);
    max.y = Math.max(max.y, v.y);
    max.z = Math.max(max.z, v.z);
  });

  return {
    min,
    max,
    center: {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2
    },
    size: {
      x: max.x - min.x,
      y: max.y - min.y,
      z: max.z - min.z
    }
  };
};

/**
 * Assign vertices to drones, creating keyframes
 * @param {Array<{x: number, y: number, z: number}>} vertices - Selected vertices
 * @param {Array<{id: number, name: string}>} drones - Available drones
 * @param {number} baseTime - Starting time for keyframes
 * @param {number} modelScale - Scale factor for the model
 * @param {{x: number, y: number, z: number}} modelPosition - Position offset
 * @returns {Array<{droneId, time, x, y, z, yaw, pitch, roll}>} Keyframes for drones
 */
export const assignVerticesToDrones = (vertices, drones, baseTime = 0, modelScale = 1, modelPosition = { x: 0, y: 0, z: 0 }) => {
  const keyframes = [];
  const connectedDrones = drones.filter(d => d.connected !== false);

  // Assign vertices to drones (limit by drone count)
  const assignCount = Math.min(vertices.length, connectedDrones.length);

  for (let i = 0; i < assignCount; i++) {
    const vertex = vertices[i];
    const drone = connectedDrones[i];

    keyframes.push({
      id: Date.now() + i,
      droneId: drone.id,
      time: baseTime,
      x: vertex.x * modelScale + modelPosition.x,
      y: vertex.y * modelScale + modelPosition.y,
      z: vertex.z * modelScale + modelPosition.z,
      yaw: 0,
      pitch: 0,
      roll: 0
    });
  }

  return keyframes;
};
