// Phase 1 debug scene: one cube per block type, textured from the atlas.
// Temporary — replaced by the real game bootstrap in later phases.
import * as THREE from 'three';
import './ui/styles.css';
import { TextureAtlas, type UvRect } from './rendering/TextureAtlas';
import { BlockId, blockDef } from './world/Block';

const app = document.getElementById('app')!;

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x78a7ff);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2.6, 7.5);
camera.lookAt(0, 0, 0);

const atlas = new TextureAtlas();

// Show the raw atlas in the corner (scaled up, crisp) as a generation check.
atlas.canvas.style.cssText =
  'position:absolute;bottom:8px;left:8px;width:192px;height:192px;image-rendering:pixelated;border:1px solid #000;';
app.appendChild(atlas.canvas);

// Face corners (CCW from outside) and UV pattern: first two verts are the
// bottom edge (v1), last two the top edge (v0), so textures stand upright.
type FaceSpec = { corners: [number, number, number][]; kind: 'top' | 'bottom' | 'side' };
const FACES: FaceSpec[] = [
  { corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], kind: 'side' }, // +X
  { corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], kind: 'side' }, // -X
  { corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], kind: 'top' }, // +Y
  { corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], kind: 'bottom' }, // -Y
  { corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], kind: 'side' }, // +Z
  { corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], kind: 'side' }, // -Z
];

function buildCube(id: BlockId): THREE.BufferGeometry {
  const def = blockDef(id)!;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const face of FACES) {
    const rect: UvRect = atlas.uvRect(def.faces[face.kind]);
    const base = pos.length / 3;
    const uvCorners = [
      [rect.u0, rect.v1],
      [rect.u1, rect.v1],
      [rect.u1, rect.v0],
      [rect.u0, rect.v0],
    ];
    face.corners.forEach((c, i) => {
      pos.push(c[0] - 0.5, c[1] - 0.5, c[2] - 0.5);
      uv.push(uvCorners[i][0], uvCorners[i][1]);
    });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

const opaqueMat = new THREE.MeshBasicMaterial({ map: atlas.texture });
const cutoutMat = new THREE.MeshBasicMaterial({ map: atlas.texture, alphaTest: 0.5, side: THREE.DoubleSide });
const blendMat = new THREE.MeshBasicMaterial({ map: atlas.texture, transparent: true, side: THREE.DoubleSide });

const blocks = [
  BlockId.Grass,
  BlockId.Dirt,
  BlockId.Stone,
  BlockId.Cobblestone,
  BlockId.Planks,
  BlockId.Log,
  BlockId.Leaves,
  BlockId.Sand,
  BlockId.Glass,
  BlockId.Water,
];

const cubes: THREE.Mesh[] = [];
blocks.forEach((id, i) => {
  const def = blockDef(id)!;
  const mat = id === BlockId.Water || id === BlockId.Glass ? blendMat : def.transparent ? cutoutMat : opaqueMat;
  const mesh = new THREE.Mesh(buildCube(id), mat);
  mesh.position.set((i - (blocks.length - 1) / 2) * 1.5, 0, 0);
  scene.add(mesh);
  cubes.push(mesh);
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
  for (const c of cubes) {
    c.rotation.y += 0.004;
    c.rotation.x = 0.4;
  }
  renderer.render(scene, camera);
  frames++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    fpsEl.textContent = `${Math.round((frames * 1000) / (now - lastFpsTime))} FPS`;
    frames = 0;
    lastFpsTime = now;
  }
});
