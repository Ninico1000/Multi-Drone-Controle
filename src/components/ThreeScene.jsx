import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { SCENE_CONFIG } from '../constants/defaults';
import { interpolate } from '../utils/interpolation';

// Slippy map tile calculation
const latLngToTile = (lat, lng, zoom) => {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lng + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
};
const tileSizeMeters = (lat, zoom) =>
  (40075016.686 * Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom);

const ThreeScene = ({
  drones,
  keyframes,
  interpolationMode,
  droneModelsRef,
  loadedModel,
  modelVertices,
  selectedVertices,
  onVertexClick,
  modelScale,
  modelPosition,
  onModelTransform,   // (pos, scale) => void  — called on gizmo drag end
  modelGizmoEnabled,  // bool — whether model move gizmo is active
  showModel,
  homePoint,
  onDroneMoved,       // (droneId, x, y, z) => void — called on drone gizmo drag end
}) => {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const orbitRef = useRef(null);
  const droneTransformRef = useRef(null);
  const modelTransformRef = useRef(null);
  const isModelDraggingRef = useRef(false);
  const droneMeshMapRef = useRef(new Map()); // droneId → mesh
  const gridRef = useRef(null);
  const pathLinesRef = useRef([]);
  const animationFrameRef = useRef(null);
  const loadedModelMeshRef = useRef(null);
  const vertexSpheresRef = useRef([]);
  const satellitePlaneRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  // Refs so [] closures always call the latest callback version
  const onDroneMovedRef = useRef(onDroneMoved);
  const onModelTransformRef = useRef(onModelTransform);
  useEffect(() => { onDroneMovedRef.current = onDroneMoved; }, [onDroneMoved]);
  useEffect(() => { onModelTransformRef.current = onModelTransform; }, [onModelTransform]);

  const droneInitKey = drones.map(d => `${d.id}_${d.color}`).join(',');

  // Auto-scale grid to fit all keyframe positions
  const gridSize = useMemo(() => {
    if (keyframes.length === 0) return 50;
    const coords = keyframes.flatMap(kf => [Math.abs(kf.x), Math.abs(kf.y)]);
    const maxCoord = Math.max(25, ...coords);
    return Math.ceil(maxCoord * 2.5 / 10) * 10;
  }, [keyframes]);

  // ── Effect 1: Scene / Camera / Renderer / Lights (once) ──────────────────
  useEffect(() => {
    if (!canvasRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SCENE_CONFIG.backgroundColor);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      75, canvasRef.current.clientWidth / canvasRef.current.clientHeight, 0.1, 10000
    );
    camera.position.set(20, 20, 20);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    rendererRef.current = renderer;

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.05;
    orbit.minDistance = 0.5;
    orbit.maxDistance = 5000;
    orbit.screenSpacePanning = true;
    orbitRef.current = orbit;

    scene.add(new THREE.AxesHelper(5));
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(10, 10, 10);
    scene.add(dir);

    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      orbit.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      orbit.dispose();
      renderer.dispose();
    };
  }, []); // eslint-disable-line

  // ── Effect 2: Dynamic grid ────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return;
    if (gridRef.current) sceneRef.current.remove(gridRef.current);
    const divs = Math.min(gridSize, 200);
    gridRef.current = new THREE.GridHelper(gridSize, divs, 0x444444, 0x222222);
    sceneRef.current.add(gridRef.current);
  }, [gridSize]);

  // ── Effect 3: Drone meshes + number labels ────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return;

    // Remove old meshes
    droneMeshMapRef.current.forEach(mesh => sceneRef.current.remove(mesh));
    droneMeshMapRef.current.clear();
    if (droneModelsRef) droneModelsRef.current = [];

    if (droneTransformRef.current) droneTransformRef.current.detach();

    drones.forEach((drone, index) => {
      const color = `#${drone.color.toString(16).padStart(6, '0')}`;

      // Cone body
      const geometry = new THREE.ConeGeometry(0.3, 0.8, 4);
      const material = new THREE.MeshPhongMaterial({ color: drone.color });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = Math.PI;
      mesh.position.set(index * 2 - (drones.length - 1), 0, 0);
      mesh.userData.droneId = drone.id;
      mesh.userData.isDrone = true;

      // Number + name label as sprite (child of mesh → follows movement)
      const lc = document.createElement('canvas');
      lc.width = 128; lc.height = 56;
      const ctx = lc.getContext('2d');
      ctx.fillStyle = color;
      ctx.roundRect(2, 2, 124, 52, 8);
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.font = 'bold 26px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${index + 1}`, 64, 28);
      ctx.font = '13px Arial';
      ctx.fillText(drone.name, 64, 46);

      const tex = new THREE.CanvasTexture(lc);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      sprite.scale.set(2.2, 1, 1);
      sprite.position.set(0, 1.4, 0);
      mesh.add(sprite);

      sceneRef.current.add(mesh);
      droneMeshMapRef.current.set(drone.id, mesh);
      if (droneModelsRef) droneModelsRef.current.push(mesh);
    });
  }, [droneInitKey]); // eslint-disable-line

  // ── Effect 4: Drone TransformControls (setup once) ───────────────────────
  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

    const tc = new TransformControls(cameraRef.current, rendererRef.current.domElement);
    tc.setMode('translate');
    tc.setSpace('world');
    tc.setSize(0.8);

    tc.addEventListener('dragging-changed', e => {
      if (orbitRef.current) orbitRef.current.enabled = !e.value;

      // On drag END: call onDroneMoved
      // Three.js coord mapping: x→x, y(up)→z(altitude), -z→y
      if (!e.value && tc.object) {
        const droneId = tc.object.userData.droneId;
        if (droneId && onDroneMovedRef.current) {
          const p = tc.object.position;
          onDroneMovedRef.current(droneId, p.x, -p.z, p.y);
        }
      }
    });

    sceneRef.current.add(tc);
    droneTransformRef.current = tc;

    return () => { tc.dispose(); };
  }, []); // eslint-disable-line

  // ── Effect 5: Model TransformControls (setup once) ───────────────────────
  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

    const tc = new TransformControls(cameraRef.current, rendererRef.current.domElement);
    tc.setMode('translate');
    tc.setSize(0.8);

    tc.addEventListener('dragging-changed', e => {
      if (orbitRef.current) orbitRef.current.enabled = !e.value;
      isModelDraggingRef.current = e.value;

      // On drag END: propagate new position to parent
      if (!e.value && tc.object && onModelTransformRef.current) {
        const p = tc.object.position;
        onModelTransformRef.current({ x: p.x, y: -p.z, z: p.y }, tc.object.scale.x);
      }
    });

    sceneRef.current.add(tc);
    modelTransformRef.current = tc;

    return () => { tc.dispose(); };
  }, []); // eslint-disable-line

  // ── Effect 6: Satellite ground texture ───────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return;
    if (satellitePlaneRef.current) {
      sceneRef.current.remove(satellitePlaneRef.current);
      satellitePlaneRef.current.material.map?.dispose();
      satellitePlaneRef.current.material.dispose();
      satellitePlaneRef.current.geometry.dispose();
      satellitePlaneRef.current = null;
    }
    if (!homePoint) return;

    const ZOOM = 18;
    const { x: tx, y: ty } = latLngToTile(homePoint.lat, homePoint.lng, ZOOM);
    const sizeM = tileSizeMeters(homePoint.lat, ZOOM);
    const GRID = 3;
    const TILE_PX = 256;
    const canvas = document.createElement('canvas');
    canvas.width = TILE_PX * GRID;
    canvas.height = TILE_PX * GRID;
    const ctx = canvas.getContext('2d');
    let loaded = 0;

    for (let dy = 0; dy < GRID; dy++) {
      for (let dx = 0; dx < GRID; dx++) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${ZOOM}/${ty + dy - 1}/${tx + dx - 1}`;
        const cx = dx * TILE_PX, cy = dy * TILE_PX;
        img.onload = () => {
          ctx.drawImage(img, cx, cy, TILE_PX, TILE_PX);
          if (++loaded === GRID * GRID && sceneRef.current) {
            const texture = new THREE.CanvasTexture(canvas);
            const totalM = sizeM * GRID;
            const plane = new THREE.Mesh(
              new THREE.PlaneGeometry(totalM, totalM),
              new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
            );
            plane.rotation.x = -Math.PI / 2;
            plane.position.set(0, -0.02, 0);
            sceneRef.current.add(plane);
            satellitePlaneRef.current = plane;
          }
        };
        img.onerror = () => { loaded++; };
      }
    }
  }, [homePoint]); // eslint-disable-line

  // ── Effect 7: Loaded 3D model ─────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return;
    if (loadedModelMeshRef.current) {
      sceneRef.current.remove(loadedModelMeshRef.current);
      loadedModelMeshRef.current = null;
    }
    if (modelTransformRef.current) modelTransformRef.current.detach();

    vertexSpheresRef.current.forEach(s => sceneRef.current.remove(s));
    vertexSpheresRef.current = [];

    if (!loadedModel || !showModel) return;

    const group = new THREE.Group();
    loadedModel.traverse(child => {
      if (child.isMesh) {
        const wf = new THREE.Mesh(
          child.geometry.clone(),
          new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.6 })
        );
        wf.position.copy(child.position);
        wf.rotation.copy(child.rotation);
        wf.scale.copy(child.scale);
        group.add(wf);
      }
    });
    const scale = modelScale || 1;
    const pos = modelPosition || { x: 0, y: 0, z: 2 };
    group.scale.set(scale, scale, scale);
    group.position.set(pos.x, pos.z, -pos.y);
    group.userData.isModel = true;

    sceneRef.current.add(group);
    loadedModelMeshRef.current = group;
  }, [loadedModel, showModel]); // eslint-disable-line

  // ── Effect 7b: Attach/detach model TC based on modelGizmoEnabled ───────────
  useEffect(() => {
    if (!modelTransformRef.current) return;
    if (modelGizmoEnabled && loadedModelMeshRef.current) {
      modelTransformRef.current.attach(loadedModelMeshRef.current);
    } else {
      modelTransformRef.current.detach();
    }
  }, [modelGizmoEnabled, loadedModel, showModel]); // eslint-disable-line

  // ── Effect 8: Sync model position/scale from props (when not dragging) ────
  useEffect(() => {
    if (!loadedModelMeshRef.current || isModelDraggingRef.current) return;
    const scale = modelScale || 1;
    const pos = modelPosition || { x: 0, y: 0, z: 0 };
    loadedModelMeshRef.current.scale.set(scale, scale, scale);
    loadedModelMeshRef.current.position.set(pos.x, pos.z, -pos.y);
  }, [modelScale, modelPosition]);

  // ── Effect 9: Vertex spheres ──────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return;
    vertexSpheresRef.current.forEach(s => sceneRef.current.remove(s));
    vertexSpheresRef.current = [];
    if (!modelVertices || modelVertices.length === 0 || !showModel) return;

    const scale = modelScale || 1;
    const pos = modelPosition || { x: 0, y: 0, z: 0 };
    modelVertices.forEach((vertex, index) => {
      const isSelected = selectedVertices?.includes(index);
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 16, 16),
        new THREE.MeshBasicMaterial({ color: isSelected ? 0xffdd00 : 0x00ffff, transparent: true, opacity: isSelected ? 1 : 0.7 })
      );
      sphere.position.set(vertex.x * scale + pos.x, vertex.z * scale + pos.z, -vertex.y * scale - pos.y);
      sphere.userData.vertexIndex = index;
      sphere.userData.isVertexSphere = true;
      sceneRef.current.add(sphere);
      vertexSpheresRef.current.push(sphere);
    });
  }, [modelVertices, selectedVertices, showModel, modelScale, modelPosition]);

  // ── Effect 10: Flight path lines ──────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return;
    pathLinesRef.current.forEach(l => sceneRef.current.remove(l));
    pathLinesRef.current = [];

    drones.forEach(drone => {
      const dkf = keyframes.filter(kf => kf.droneId === drone.id).sort((a, b) => a.time - b.time);
      if (dkf.length < 2) return;
      const points = [];
      for (let i = 0; i < dkf.length - 1; i++) {
        const steps = Math.max(10, Math.floor((dkf[i + 1].time - dkf[i].time) * 10));
        for (let t = 0; t <= steps; t++) {
          const pos = interpolate(dkf[i], dkf[i + 1], t / steps, interpolationMode);
          points.push(new THREE.Vector3(pos.x, pos.z, -pos.y));
        }
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: drone.color, linewidth: 2 })
      );
      sceneRef.current.add(line);
      pathLinesRef.current.push(line);
    });
  }, [keyframes, drones, interpolationMode]);

  // ── Click handler: vertex select OR drone select ───────────────────────────
  const handleClick = useCallback((event) => {
    if (!canvasRef.current || !cameraRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

    // 1. Vertex spheres
    if (modelVertices?.length > 0 && onVertexClick) {
      const hits = raycasterRef.current.intersectObjects(vertexSpheresRef.current);
      if (hits.length > 0 && hits[0].object.userData.isVertexSphere) {
        onVertexClick(hits[0].object.userData.vertexIndex, event.shiftKey);
        return;
      }
    }

    // 2. Drone cones
    const droneMeshes = [...droneMeshMapRef.current.values()];
    const droneHits = raycasterRef.current.intersectObjects(droneMeshes, false);
    if (droneHits.length > 0) {
      const mesh = droneHits[0].object;
      if (mesh.userData.isDrone && droneTransformRef.current) {
        droneTransformRef.current.attach(mesh);
      }
      return;
    }

    // 3. Click on empty → deselect drone gizmo
    if (droneTransformRef.current) droneTransformRef.current.detach();
  }, [modelVertices, onVertexClick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('click', handleClick);
    return () => canvas.removeEventListener('click', handleClick);
  }, [handleClick]);

  // ── Safety: re-enable OrbitControls on window pointerup ──────────────────
  // Prevents orbit staying locked if drag ends outside the canvas
  useEffect(() => {
    const onWindowPointerUp = () => {
      if (orbitRef.current) orbitRef.current.enabled = true;
    };
    window.addEventListener('pointerup', onWindowPointerUp);
    return () => window.removeEventListener('pointerup', onWindowPointerUp);
  }, []);

  return <canvas ref={canvasRef} className="w-full h-96 rounded bg-gray-900" />;
};

export default ThreeScene;
