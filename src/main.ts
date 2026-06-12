// Phase 4 scene: playable first-person creative movement on streamed terrain.
// Menu/HUD chrome arrives in later phases; debug readout is temporary.
import * as THREE from 'three';
import './ui/styles.css';
import { GameLoop } from './core/GameLoop';
import { Input } from './core/Input';
import { TextureAtlas } from './rendering/TextureAtlas';
import { ChunkRenderer } from './rendering/ChunkRenderer';
import { Sky, DAY_LENGTH } from './rendering/Sky';
import { Clouds } from './rendering/Clouds';
import { World } from './world/World';
import { TerrainGenerator } from './world/TerrainGenerator';
import { Player, EYE_HEIGHT } from './player/Player';
import { PlayerPhysics } from './player/PlayerPhysics';
import { PlayerController } from './player/PlayerController';
import { BlockInteraction } from './player/BlockInteraction';
import { Hud } from './ui/Hud';
import { settings } from './settings/Settings';
import { BlockId, blockDef } from './world/Block';
import { AudioEngine } from './audio/AudioEngine';
import { Sfx } from './audio/Sfx';
import { Music } from './audio/Music';

const app = document.getElementById('app')!;

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x78a7ff);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';

const generator = new TerrainGenerator('claudecraft');
const world = new World(generator);
const atlas = new TextureAtlas();
const chunkRenderer = new ChunkRenderer(world, atlas);
scene.add(chunkRenderer.group);

const sky = new Sky(scene, settings.renderDistance * 16);
const clouds = new Clouds();
scene.add(clouds.group);
let worldTime = 1000; // start in the early morning

const input = new Input(renderer.domElement);
renderer.domElement.addEventListener('click', () => input.requestPointerLock());

const player = new Player();
const physics = new PlayerPhysics(world, player);
const controller = new PlayerController(input, player, settings);

const interaction = new BlockInteraction(world, player);
scene.add(interaction.highlight);
const hud = new Hud(app, atlas);

const audio = new AudioEngine(settings);
const sfx = new Sfx(audio);
const music = new Music(audio);

function startAudioOnGesture(): void {
  if (audio.ensureStarted() && !music.playing) {
    audio.musicDuck = 0.5; // in-game: quieter than the menu
    audio.applyVolumes();
    music.start();
  }
}
window.addEventListener('mousedown', startAudioOnGesture);
window.addEventListener('keydown', startAudioOnGesture);

function soundMaterialAt(x: number, y: number, z: number) {
  return blockDef(world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)))?.sound ?? 'none';
}

input.onKeyDown((code) => hud.handleKey(code));
input.onMouseDown((button) => {
  if (!input.pointerLocked) return;
  if (button === 0) {
    const target = interaction.target;
    const broken = interaction.breakBlock();
    if (broken !== null && target) sfx.blockBreak(blockDef(broken)?.sound ?? 'none');
  } else if (button === 2) {
    if (interaction.placeBlock(hud.selectedBlock)) {
      sfx.blockPlace(blockDef(hud.selectedBlock)?.sound ?? 'none');
    }
  }
});

// Spawn atop the terrain at the world origin (chunk data generated eagerly).
world.ensureChunk(0, 0);
player.teleport(0.5, generator.height(0, 0) + 1, 0.5);

let strideDistance = 0;

function tick(): void {
  physics.tick(controller.intent());
  worldTime++;

  // Footsteps: stride accumulator, ground only (~every 1.5 m walked).
  if (player.onGround && !player.flying) {
    strideDistance += Math.hypot(
      player.position.x - player.prevPosition.x,
      player.position.z - player.prevPosition.z,
    );
    if (strideDistance >= 1.5) {
      strideDistance = 0;
      sfx.footstep(soundMaterialAt(player.position.x, player.position.y - 0.01, player.position.z));
    }
  } else {
    strideDistance = 0;
  }
}

const interpolatedPos = new THREE.Vector3();
let currentFov = settings.fov;

function render(alpha: number, frameDtMs: number): void {
  lastFrameDt = frameDtMs / 1000;
  controller.updateLook();
  hud.scroll(input.consumeWheel());
  interaction.updateTarget();

  player.interpolated(alpha, interpolatedPos);
  camera.position.set(interpolatedPos.x, interpolatedPos.y + EYE_HEIGHT, interpolatedPos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);

  // Sprint FOV: ~+10%, eased.
  const targetFov = settings.fov * (player.sprinting ? 1.1 : 1);
  currentFov += (targetFov - currentFov) * 0.2;
  if (Math.abs(camera.fov - currentFov) > 0.01) {
    camera.fov = currentFov;
    camera.updateProjectionMatrix();
  }

  chunkRenderer.stream(player.position.x, player.position.z, settings.renderDistance);
  chunkRenderer.update(2);

  sky.update(worldTime + alpha, camera.position);
  clouds.update(lastFrameDt, player.position.x, player.position.z, sky.cloudColor);
  audio.applyVolumes();
  renderer.setClearColor(sky.skyColor);
  renderer.render(scene, camera);
}

const loop = new GameLoop(tick, render);
let lastFrameDt = 1 / 60;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- temporary debug readout + automation hooks ---
const fpsEl = document.createElement('div');
fpsEl.id = 'fps';
app.appendChild(fpsEl);

let frames = 0;
let lastFpsTime = performance.now();
let fpsText = '';
let jumpStartY: number | null = null;
let lastApex = 0;

renderer.setAnimationLoop(() => {
  loop.frame(performance.now());

  // Jump apex tracking for acceptance measurement.
  if (!player.onGround && !player.flying) {
    if (jumpStartY === null) jumpStartY = player.prevPosition.y;
    lastApex = Math.max(lastApex, player.position.y - jumpStartY);
  } else if (jumpStartY !== null) {
    jumpStartY = null;
  }

  frames++;
  const now = performance.now();
  if (now - lastFpsTime >= 500) {
    fpsText = `${Math.round((frames * 1000) / (now - lastFpsTime))} FPS`;
    frames = 0;
    lastFpsTime = now;
  }
  fpsEl.textContent =
    `${fpsText}\n` +
    `pos ${player.position.x.toFixed(2)}, ${player.position.y.toFixed(2)}, ${player.position.z.toFixed(2)}\n` +
    `hspeed ${player.horizontalSpeed.toFixed(3)} m/s\n` +
    `ground ${player.onGround}  fly ${player.flying}  sprint ${player.sprinting}\n` +
    `jump apex ${lastApex.toFixed(3)}\n` +
    `time ${Math.floor(worldTime % DAY_LENGTH)}`;
});
fpsEl.style.whiteSpace = 'pre';

Object.assign(window as object, {
  player,
  world,
  controller,
  interaction,
  hud,
  audio,
  sfx,
  music,
  settings,
  BlockId,
  resetApex: () => {
    lastApex = 0;
  },
  getApex: () => lastApex,
  setBlock: (x: number, y: number, z: number, id: number) => world.setBlock(x, y, z, id),
  setTime: (t: number) => {
    worldTime = t;
  },
  getTime: () => worldTime,
});
