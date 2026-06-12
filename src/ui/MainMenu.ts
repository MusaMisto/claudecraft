// Title screen: code-drawn pixel wordmark, rotating splash text, buttons,
// and a live slowly-rotating world panorama rendered behind the overlay.
import * as THREE from 'three';
import { World } from '../world/World';
import { TerrainGenerator } from '../world/TerrainGenerator';
import { ChunkRenderer } from '../rendering/ChunkRenderer';
import { Sky } from '../rendering/Sky';
import { Clouds } from '../rendering/Clouds';
import type { TextureAtlas } from '../rendering/TextureAtlas';

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
];

// Tiny original 5×7 pixel font — only the letters the wordmark needs.
const GLYPHS: Record<string, string[]> = {
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
};

function drawWordmark(text: string): HTMLCanvasElement {
  const scale = 6;
  const spacing = 1;
  const cols = text.length * (5 + spacing) - spacing;
  const canvas = document.createElement('canvas');
  canvas.width = cols * scale;
  canvas.height = (7 + 1) * scale; // +1 row for the drop shadow
  const ctx = canvas.getContext('2d')!;
  for (let li = 0; li < text.length; li++) {
    const glyph = GLYPHS[text[li]];
    const ox = li * (5 + spacing);
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] !== '1') continue;
        const x = (ox + col) * scale;
        const y = row * scale;
        ctx.fillStyle = '#2c2c30'; // drop shadow
        ctx.fillRect(x + scale * 0.5, y + scale, scale, scale);
        ctx.fillStyle = row < 2 ? '#e8e8ee' : row < 5 ? '#c2c2cc' : '#94949e'; // beveled gray
        ctx.fillRect(x, y, scale, scale);
      }
    }
  }
  return canvas;
}

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
    this.sky = new Sky(this.scene, 4 * 16);
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
    this.chunkRenderer.stream(this.center.x, this.center.z, 4, 2);
    this.chunkRenderer.update(2);
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
  private splashEl: HTMLElement;
  private splashTimer: number;
  private splashIndex: number;

  constructor(container: HTMLElement, renderer: THREE.WebGLRenderer, atlas: TextureAtlas) {
    this.panorama = new Panorama(renderer, atlas);

    this.root = document.createElement('div');
    this.root.id = 'main-menu';

    const logoWrap = document.createElement('div');
    logoWrap.className = 'logo-wrap';
    const logo = drawWordmark('CLAUDECRAFT');
    logo.className = 'logo';
    logoWrap.appendChild(logo);

    this.splashEl = document.createElement('div');
    this.splashEl.className = 'splash';
    this.splashIndex = Math.floor(Math.random() * SPLASHES.length);
    logoWrap.appendChild(this.splashEl);
    this.root.appendChild(logoWrap);

    const buttons = document.createElement('div');
    buttons.className = 'menu-buttons';
    const mkButton = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.className = 'mc-button';
      b.textContent = label;
      b.addEventListener('click', () => {
        this.onButtonSound?.();
        fn();
      });
      buttons.appendChild(b);
    };
    mkButton('Singleplayer', () => this.onSingleplayer?.());
    mkButton('Options', () => this.onOptions?.());
    this.root.appendChild(buttons);

    const credit = document.createElement('div');
    credit.className = 'menu-credit';
    credit.textContent = 'An original voxel sandbox — all assets generated in code';
    this.root.appendChild(credit);

    container.appendChild(this.root);

    this.rotateSplash();
    this.splashTimer = window.setInterval(() => this.rotateSplash(), 4000);
  }

  private rotateSplash(): void {
    this.splashEl.textContent = SPLASHES[this.splashIndex % SPLASHES.length];
    this.splashIndex++;
  }

  frame(now: number): void {
    this.panorama.frame(now);
  }

  resize(width: number, height: number): void {
    this.panorama.resize(width, height);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }

  dispose(): void {
    clearInterval(this.splashTimer);
    this.panorama.dispose();
    this.root.remove();
  }
}
