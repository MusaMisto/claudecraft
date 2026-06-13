// Bootstrap: single renderer + menu → game lifecycle state machine.
import * as THREE from 'three';
import './ui/styles.css';
import { Game } from './Game';
import { TextureAtlas } from './rendering/TextureAtlas';
import { MainMenu } from './ui/MainMenu';
import { OptionsMenu } from './ui/OptionsMenu';
import { PauseMenu } from './ui/PauseMenu';
import { settings } from './settings/Settings';
import { AudioEngine } from './audio/AudioEngine';
import { Sfx } from './audio/Sfx';
import { Music } from './audio/Music';

const app = document.getElementById('app')!;

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const atlas = new TextureAtlas();
const audio = new AudioEngine(settings);
const sfx = new Sfx(audio);
const music = new Music(audio);

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
const mainMenu = new MainMenu(app, renderer, atlas);
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

function startGame(): void {
  mainMenu.setVisible(false);
  fpsEl.style.display = 'none'; // in-game FPS lives in the F3 overlay
  audio.musicDuck = 0.5; // quieter in-game
  audio.applyVolumes();
  game = new Game(renderer, app, settings, audio, sfx, atlas);
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
