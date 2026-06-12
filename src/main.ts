// Phase 2 debug scene: hand-filled flat 3×3-chunk world to verify meshing.
// Temporary — replaced by the real game bootstrap in later phases.
import * as THREE from 'three';
import './ui/styles.css';
import { TextureAtlas } from './rendering/TextureAtlas';
import { ChunkRenderer } from './rendering/ChunkRenderer';
import { BlockId } from './world/Block';
import { CHUNK_SIZE } from './world/Chunk';
import { World } from './world/World';

const app = document.getElementById('app')!;

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x78a7ff);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(24, 22, 60);
camera.lookAt(24, 6, 24);

const atlas = new TextureAtlas();
const world = new World();

// Flat slab across chunks -1..1 in x/z (world x/z 0..47 shifted by -16):
// stone up to y=3, dirt y=4..6, grass at y=7, plus a few feature blocks.
for (let cx = 0; cx <= 2; cx++) {
  for (let cz = 0; cz <= 2; cz++) {
    const chunk = world.getOrCreateChunk(cx, cz);
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let y = 0; y <= 3; y++) chunk.set(lx, y, lz, BlockId.Stone);
        for (let y = 4; y <= 6; y++) chunk.set(lx, y, lz, BlockId.Dirt);
        chunk.set(lx, 7, lz, BlockId.Grass);
      }
    }
  }
}
// Feature blocks: a glass column, a water pool, a leaf cube, a log tower.
world.setBlock(20, 8, 20, BlockId.Glass);
world.setBlock(20, 9, 20, BlockId.Glass);
for (let x = 26; x <= 29; x++) for (let z = 26; z <= 29; z++) world.setBlock(x, 7, z, BlockId.Water);
world.setBlock(34, 8, 22, BlockId.Leaves);
world.setBlock(34, 9, 22, BlockId.Leaves);
world.setBlock(14, 8, 30, BlockId.Log);
world.setBlock(14, 9, 30, BlockId.Log);
world.setBlock(14, 10, 30, BlockId.Log);

const chunkRenderer = new ChunkRenderer(world, atlas);
scene.add(chunkRenderer.group);
for (let cx = 0; cx <= 2; cx++) for (let cz = 0; cz <= 2; cz++) chunkRenderer.buildChunk(cx, cz);
world.dirty.clear(); // initial build covers everything

// Debug hooks for console / automated verification.
let wireframe = false;
function toggleWireframe(): void {
  wireframe = !wireframe;
  chunkRenderer.setWireframe(wireframe);
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyF') toggleWireframe();
});
Object.assign(window as object, {
  world,
  BlockId,
  toggleWireframe,
  setBlock: (x: number, y: number, z: number, id: number) => {
    world.setBlock(x, y, z, id);
    chunkRenderer.update();
  },
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const fpsEl = document.createElement('div');
fpsEl.id = 'fps';
app.appendChild(fpsEl);

let frames = 0;
let lastFpsTime = performance.now();

renderer.setAnimationLoop(() => {
  chunkRenderer.update();
  renderer.render(scene, camera);
  frames++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    fpsEl.textContent = `${Math.round((frames * 1000) / (now - lastFpsTime))} FPS`;
    frames = 0;
    lastFpsTime = now;
  }
});
