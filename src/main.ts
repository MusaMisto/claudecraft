// Phase 3 debug scene: streamed procedural terrain with a free-fly camera.
// Temporary — replaced by the real game bootstrap in later phases.
import * as THREE from 'three';
import './ui/styles.css';
import { TextureAtlas } from './rendering/TextureAtlas';
import { ChunkRenderer } from './rendering/ChunkRenderer';
import { World } from './world/World';
import { TerrainGenerator } from './world/TerrainGenerator';

const RENDER_DISTANCE = 6;

const app = document.getElementById('app')!;

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x78a7ff);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);

const generator = new TerrainGenerator('claudecraft');
const world = new World(generator);
const atlas = new TextureAtlas();
const chunkRenderer = new ChunkRenderer(world, atlas);
scene.add(chunkRenderer.group);

camera.position.set(8, generator.height(8, 8) + 14, 8);

// Temporary free-fly controls: drag to look, WASD + R/F to move.
let yaw = -0.6;
let pitch = -0.35;
const keys = new Set<string>();
window.addEventListener('keydown', (e) => keys.add(e.code));
window.addEventListener('keyup', (e) => keys.delete(e.code));
let dragging = false;
renderer.domElement.addEventListener('mousedown', () => (dragging = true));
window.addEventListener('mouseup', () => (dragging = false));
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  yaw -= e.movementX * 0.003;
  pitch = Math.max(-1.55, Math.min(1.55, pitch - e.movementY * 0.003));
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const fpsEl = document.createElement('div');
fpsEl.id = 'fps';
app.appendChild(fpsEl);

// Debug hooks for automated verification.
const debug = { autoFly: false };
Object.assign(window as object, { camera, world, debug });

let frames = 0;
let lastFpsTime = performance.now();
let lastTime = performance.now();

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  const speed = 40;
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  if (keys.has('KeyW') || debug.autoFly) camera.position.addScaledVector(forward, speed * dt);
  if (keys.has('KeyS')) camera.position.addScaledVector(forward, -speed * dt);
  if (keys.has('KeyD')) camera.position.addScaledVector(right, speed * dt);
  if (keys.has('KeyA')) camera.position.addScaledVector(right, -speed * dt);
  if (keys.has('KeyR')) camera.position.y += speed * dt;
  if (keys.has('KeyF')) camera.position.y -= speed * dt;
  camera.rotation.set(0, 0, 0);
  camera.rotateY(yaw);
  camera.rotateX(pitch);

  chunkRenderer.stream(camera.position.x, camera.position.z, RENDER_DISTANCE);
  chunkRenderer.update(2);
  renderer.render(scene, camera);

  frames++;
  if (now - lastFpsTime >= 1000) {
    fpsEl.textContent = `${Math.round((frames * 1000) / (now - lastFpsTime))} FPS — ${camera.position
      .toArray()
      .map((v) => v.toFixed(0))
      .join(', ')}`;
    frames = 0;
    lastFpsTime = now;
  }
});
