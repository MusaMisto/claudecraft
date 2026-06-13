// Bootstrap: single renderer + menu → game lifecycle state machine.
import * as THREE from 'three';
import './ui/styles.css';
import { Game } from './Game';
import { TextureAtlas } from './rendering/TextureAtlas';
import { loadFaithfulTextures } from './rendering/FaithfulTextures';
import { MainMenu } from './ui/MainMenu';
import { OptionsMenu } from './ui/OptionsMenu';
import { PauseMenu } from './ui/PauseMenu';
import { settings } from './settings/Settings';
import { AudioEngine } from './audio/AudioEngine';
import { Sfx } from './audio/Sfx';
import { Music } from './audio/Music';
import { SkinManager } from './player/SkinManager';
import { faviconUrl } from './assets/assets';

// Use the project favicon (docs/favicon.png), bundled by Vite.
{
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/png';
  link.href = faviconUrl;
}

const app = document.getElementById('app')!;

// Drawing-buffer AA is part of the vanilla baseline. The Vibrant composer
// additionally uses a multisampled HalfFloat target for the world pass.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const atlas = new TextureAtlas();
// Overpaint the procedural base with Faithful 64x textures once they decode
// (non-blocking: the menu/game render the procedural fallback until then, and
// keep it for any tile that fails to load). The atlas texture is shared, so the
// re-upload reaches already-meshed chunks without re-meshing.
void loadFaithfulTextures()
  .then((faithful) => atlas.applyFaithful(faithful))
  .catch((err) => console.warn('[Faithful] texture pack unavailable; using procedural textures.', err));
const audio = new AudioEngine(settings);
const sfx = new Sfx(audio);
const music = new Music(audio);
const skins = new SkinManager();

// Audio may only start from a user gesture (autoplay policy).
function startAudioOnGesture(): void {
  if (audio.ensureStarted() && !music.playing) music.start();
}
window.addEventListener('mousedown', startAudioOnGesture);
window.addEventListener('keydown', startAudioOnGesture);

const fpsEl = document.createElement('div');
fpsEl.id = 'fps-corner';
app.appendChild(fpsEl);

let game: Game | null = null;
const mainMenu = new MainMenu(app, renderer, atlas, skins);
const optionsMenu = new OptionsMenu(app, settings);
const pauseMenu = new PauseMenu(app);

const click = () => sfx.click();
mainMenu.onButtonSound = click;
optionsMenu.onButtonSound = click;
pauseMenu.onButtonSound = click;

optionsMenu.onChanged = () => {
  audio.applyVolumes();
  game?.applyVisuals();
};

function startGame(seed?: string): void {
  mainMenu.setVisible(false);
  fpsEl.style.display = 'none'; // in-game FPS lives in the F3 overlay
  audio.musicDuck = 0.5; // quieter in-game
  audio.applyVolumes();
  game = new Game(renderer, app, settings, audio, sfx, atlas, skins, seed);
  game.onPauseRequested = () => {
    game?.pause();
    pauseMenu.show();
  };
  Object.assign(window as object, game.debugHooks());
  game.resume();
}

function quitToTitle(): void {
  pauseMenu.hide();
  optionsMenu.hide();
  game?.dispose();
  game = null;
  audio.musicDuck = 1;
  audio.applyVolumes();
  fpsEl.style.display = '';
  mainMenu.setVisible(true);
}

mainMenu.onSingleplayer = startGame;
mainMenu.onOptions = () => optionsMenu.show();
optionsMenu.onClose = () => {
  // If the game is paused underneath, the pause menu is still there.
};
pauseMenu.onBack = () => {
  pauseMenu.hide();
  game?.resume();
};
pauseMenu.onOptions = () => optionsMenu.show();
pauseMenu.onQuit = quitToTitle;

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  mainMenu.resize(window.innerWidth, window.innerHeight);
  game?.resize(window.innerWidth, window.innerHeight);
});

let frames = 0;
let lastFpsTime = performance.now();

renderer.setAnimationLoop(() => {
  const now = performance.now();
  if (game) {
    game.frame(now);
  } else {
    mainMenu.frame(now);
    audio.applyVolumes();
  }
  frames++;
  if (now - lastFpsTime >= 1000) {
    fpsEl.textContent = `${Math.round((frames * 1000) / (now - lastFpsTime))} FPS`;
    frames = 0;
    lastFpsTime = now;
  }
});

// Lifecycle hooks for automated verification.
Object.assign(window as object, {
  app: { startGame, quitToTitle, get game() { return game; }, renderer, audio, music, sfx, settings, mainMenu, pauseMenu, optionsMenu },
});
