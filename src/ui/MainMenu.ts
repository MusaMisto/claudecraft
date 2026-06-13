// Title screen: the custom Claudecraft logo, rotating splash text, a centered
// Play / Settings button stack, and a right-side 3D player preview with an
// Upload Skin control — all over a live slowly-rotating world panorama.
// Bedrock-menu-inspired layout, clean-room (no Marketplace / Sign In / Dressing
// Room / bottle icon).
import * as THREE from 'three';
import { World } from '../world/World';
import { TerrainGenerator } from '../world/TerrainGenerator';
import { ChunkRenderer } from '../rendering/ChunkRenderer';
import { Sky } from '../rendering/Sky';
import { Clouds } from '../rendering/Clouds';
import type { TextureAtlas } from '../rendering/TextureAtlas';
import { PlayerPreview } from './PlayerPreview';
import { SkinError, type SkinManager } from '../player/SkinManager';
import { logoUrl } from '../assets/assets';

// Original splash quips.
const SPLASHES = [
  'Made of math!',
  'Procedurally pleasant!',
  '20 ticks per second of fun!',
  'Every pixel drawn by code!',
  'Simplex appeal!',
  'Clouds included, free!',
  'Water you waiting for?',
  'Also try going outside!',
  'Now with 100% more blocks!',
  'Compiles before you blink!',
  'Zero assets were downloaded!',
  'Bring your own skin!',
];

// Render the menu panorama far enough that fog sits at the horizon, not nearby.
const PANORAMA_CHUNKS = 12;
const USERNAME_KEY = 'claudecraft.username';
const DEFAULT_USERNAME = 'Claude';

/** Slowly rotating camera inside a small generated world. */
class Panorama {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world: World;
  private chunkRenderer: ChunkRenderer;
  private sky: Sky;
  private clouds: Clouds;
  private yaw = 0;
  private worldTime = 4000;
  private last: number | null = null;
  private center: THREE.Vector3;

  constructor(
    private renderer: THREE.WebGLRenderer,
    atlas: TextureAtlas,
  ) {
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.rotation.order = 'YXZ';
    const generator = new TerrainGenerator('claudecraft-panorama');
    this.world = new World(generator);
    this.chunkRenderer = new ChunkRenderer(this.world, atlas);
    this.scene.add(this.chunkRenderer.group);
    this.sky = new Sky(this.scene, PANORAMA_CHUNKS * 16);
    this.clouds = new Clouds();
    this.scene.add(this.clouds.group);
    this.center = new THREE.Vector3(8.5, generator.height(8, 8) + 12, 8.5);
  }

  frame(now: number): void {
    const dt = this.last === null ? 1 / 60 : Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    this.yaw += dt * 0.04;
    this.worldTime += dt * 20;

    this.camera.position.copy(this.center);
    this.camera.rotation.set(-0.16, this.yaw, 0);
    // Static camera: stream a wide radius (a few chunks/frame fills it in a few
    // seconds and it then stays loaded) so the world reaches the far horizon.
    this.chunkRenderer.stream(this.center.x, this.center.z, PANORAMA_CHUNKS, 4);
    this.chunkRenderer.update(3);
    this.sky.update(this.worldTime, this.camera.position);
    this.clouds.update(dt, this.center.x, this.center.z, this.sky.cloudColor);
    this.renderer.setClearColor(this.sky.skyColor);
    this.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.chunkRenderer.dispose();
    this.sky.dispose();
    this.clouds.dispose();
    this.scene.clear();
  }
}

export class MainMenu {
  onSingleplayer: (() => void) | null = null;
  onOptions: (() => void) | null = null;
  onButtonSound: (() => void) | null = null;

  private root: HTMLElement;
  private panorama: Panorama;
  private preview: PlayerPreview;
  private splashEl: HTMLElement;
  private splashTimer: number;
  private splashIndex: number;
  private usernameEl: HTMLInputElement;
  private statusEl: HTMLElement;
  private fileInput: HTMLInputElement;
  private statusTimer = 0;

  constructor(
    container: HTMLElement,
    renderer: THREE.WebGLRenderer,
    atlas: TextureAtlas,
    private skins: SkinManager,
  ) {
    this.panorama = new Panorama(renderer, atlas);

    this.root = document.createElement('div');
    this.root.id = 'main-menu';

    const overlay = document.createElement('div');
    overlay.className = 'menu-overlay';
    this.root.appendChild(overlay);

    // --- logo + splash ---
    const logoWrap = document.createElement('div');
    logoWrap.className = 'logo-wrap';
    const logo = document.createElement('img');
    logo.className = 'logo';
    logo.src = logoUrl;
    logo.alt = 'Claudecraft';
    logoWrap.appendChild(logo);
    this.splashEl = document.createElement('div');
    this.splashEl.className = 'splash';
    this.splashIndex = Math.floor(Math.random() * SPLASHES.length);
    logoWrap.appendChild(this.splashEl);
    this.root.appendChild(logoWrap);

    // --- centered actions ---
    const buttons = document.createElement('div');
    buttons.className = 'menu-buttons main-actions';
    const mkButton = (label: string, fn: () => void, parent: HTMLElement, cls = 'mc-button') => {
      const b = document.createElement('button');
      b.className = cls;
      b.textContent = label;
      b.addEventListener('click', () => {
        this.onButtonSound?.();
        fn();
      });
      parent.appendChild(b);
      return b;
    };
    mkButton('Play', () => this.onSingleplayer?.(), buttons);
    mkButton('Settings', () => this.onOptions?.(), buttons);
    this.root.appendChild(buttons);

    // --- right-side player panel ---
    const panel = document.createElement('div');
    panel.className = 'player-panel';
    // Editable username shown above the character (default "Claude", persisted).
    this.usernameEl = document.createElement('input');
    this.usernameEl.className = 'username-input';
    this.usernameEl.type = 'text';
    this.usernameEl.maxLength = 16;
    this.usernameEl.spellcheck = false;
    this.usernameEl.value = loadUsername();
    this.usernameEl.addEventListener('input', () => saveUsername(this.usernameEl.value));
    this.usernameEl.addEventListener('keydown', (e) => e.stopPropagation()); // typing, not gameplay
    const stage = document.createElement('div');
    stage.className = 'preview-stage';
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'skin-status';
    const uploadBtn = mkButton('Upload Skin', () => this.fileInput.click(), panel, 'mc-button upload-button');
    // Order: username (top), 3D stage, Upload Skin, status — preview above the button.
    panel.insertBefore(this.usernameEl, panel.firstChild);
    panel.insertBefore(stage, uploadBtn);
    panel.appendChild(this.statusEl);

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/png,.png';
    this.fileInput.style.display = 'none';
    this.fileInput.addEventListener('change', () => this.onFileChosen());
    panel.appendChild(this.fileInput);
    this.root.appendChild(panel);

    const credit = document.createElement('div');
    credit.className = 'menu-credit';
    credit.textContent = 'An original voxel sandbox — all assets generated in code';
    this.root.appendChild(credit);

    container.appendChild(this.root);

    this.preview = new PlayerPreview(renderer, stage, skins);

    this.rotateSplash();
    this.splashTimer = window.setInterval(() => this.rotateSplash(), 4000);
  }

  private rotateSplash(): void {
    this.splashEl.textContent = SPLASHES[this.splashIndex % SPLASHES.length];
    this.splashIndex++;
  }

  private async onFileChosen(): Promise<void> {
    const file = this.fileInput.files?.[0];
    this.fileInput.value = ''; // allow re-selecting the same file later
    if (!file) return;
    this.setStatus('Loading skin…', 'info');
    try {
      await this.skins.loadUploadedSkin(file);
      this.setStatus('Skin loaded successfully.', 'ok');
    } catch (err) {
      const msg = err instanceof SkinError ? err.message : 'Could not load this skin.';
      this.setStatus(msg, 'error');
    }
  }

  private setStatus(text: string, kind: 'info' | 'ok' | 'error'): void {
    this.statusEl.textContent = text;
    this.statusEl.dataset.kind = kind;
    window.clearTimeout(this.statusTimer);
    if (kind !== 'error') {
      this.statusTimer = window.setTimeout(() => {
        if (this.statusEl.textContent === text) this.statusEl.textContent = '';
      }, 4000);
    }
  }

  frame(now: number): void {
    this.panorama.frame(now);
    if (this.root.style.display !== 'none') {
      const dt = 1 / 60;
      this.preview.frame(dt);
    }
  }

  resize(width: number, height: number): void {
    this.panorama.resize(width, height);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }

  dispose(): void {
    clearInterval(this.splashTimer);
    window.clearTimeout(this.statusTimer);
    this.preview.dispose();
    this.panorama.dispose();
    this.root.remove();
  }
}

function loadUsername(): string {
  try {
    return localStorage.getItem(USERNAME_KEY) || DEFAULT_USERNAME;
  } catch {
    return DEFAULT_USERNAME;
  }
}

function saveUsername(name: string): void {
  try {
    localStorage.setItem(USERNAME_KEY, name);
  } catch {
    /* storage unavailable — username just won't persist */
  }
}
