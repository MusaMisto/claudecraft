import * as THREE from 'three';
import './ui/styles.css';

const app = document.getElementById('app')!;

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x78a7ff);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 70, 0);

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
  renderer.render(scene, camera);
  frames++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    fpsEl.textContent = `${Math.round((frames * 1000) / (now - lastFpsTime))} FPS`;
    frames = 0;
    lastFpsTime = now;
  }
});
