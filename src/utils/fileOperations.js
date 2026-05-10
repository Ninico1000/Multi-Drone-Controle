import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import * as THREE from 'three';
import { extractVerticesFromObject, extractVertices } from './modelUtils';

export const saveMission = (keyframes, interpolationMode, addLog) => {
  const data = {
    version: '3.0',
    interpolationMode,
    keyframes
  };
  const dataStr = JSON.stringify(data, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'mission_' + Date.now() + '.json';
  link.click();
  addLog('Mission gespeichert: ' + keyframes.length + ' Keyframes');
};

export const loadMission = (setKeyframes, setInterpolationMode, addLog) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        setKeyframes(data.keyframes || []);
        setInterpolationMode(data.interpolationMode || 'smooth');
        addLog('Mission geladen: ' + (data.keyframes?.length || 0) + ' Keyframes');
      } catch (err) {
        addLog('Fehler beim Laden der Mission');
      }
    };
    reader.readAsText(file);
  };
  input.click();
};

/**
 * Load a 3D model file (OBJ, STL, GLTF, GLB)
 */
export const load3DModel = (onLoad, onProgress, onError, addLog) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.obj,.stl,.gltf,.glb';

  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = file.name;
    const extension = fileName.split('.').pop().toLowerCase();
    const url = URL.createObjectURL(file);

    addLog && addLog('Lade 3D Modell: ' + fileName);

    const handleLoadComplete = (object, vertices) => {
      URL.revokeObjectURL(url);
      addLog && addLog('Modell geladen: ' + vertices.length + ' Vertices');
      onLoad && onLoad(object, vertices, fileName);
    };

    const handleError = (error) => {
      URL.revokeObjectURL(url);
      const errorMsg = 'Fehler beim Laden: ' + (error.message || 'Unbekannter Fehler');
      addLog && addLog(errorMsg);
      onError && onError(error);
    };

    const handleProgress = (xhr) => {
      if (xhr.lengthComputable) {
        const percent = Math.round((xhr.loaded / xhr.total) * 100);
        onProgress && onProgress(percent);
      }
    };

    try {
      switch (extension) {
        case 'gltf':
        case 'glb':
          loadGLTF(url, handleLoadComplete, handleProgress, handleError);
          break;
        case 'obj':
          loadOBJ(url, handleLoadComplete, handleProgress, handleError);
          break;
        case 'stl':
          loadSTL(url, handleLoadComplete, handleProgress, handleError);
          break;
        default:
          handleError(new Error('Nicht unterstütztes Format: ' + extension));
      }
    } catch (error) {
      handleError(error);
    }
  };

  input.click();
};

const loadGLTF = (url, onLoad, onProgress, onError) => {
  const loader = new GLTFLoader();
  loader.load(
    url,
    (gltf) => {
      const model = gltf.scene;
      const vertices = extractVerticesFromObject(model);
      onLoad(model, vertices);
    },
    onProgress,
    onError
  );
};

const loadOBJ = (url, onLoad, onProgress, onError) => {
  const loader = new OBJLoader();
  loader.load(
    url,
    (object) => {
      const vertices = extractVerticesFromObject(object);
      onLoad(object, vertices);
    },
    onProgress,
    onError
  );
};

const loadSTL = (url, onLoad, onProgress, onError) => {
  const loader = new STLLoader();
  loader.load(
    url,
    (geometry) => {
      const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
      const mesh = new THREE.Mesh(geometry, material);
      const group = new THREE.Group();
      group.add(mesh);

      const vertices = extractVertices(geometry);
      onLoad(group, vertices);
    },
    onProgress,
    onError
  );
};
