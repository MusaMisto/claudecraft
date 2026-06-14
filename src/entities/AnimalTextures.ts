import * as THREE from 'three';
import type { AnimalKind, ClimateVariant } from './AnimalTypes';

export type AnimalTextureLayer = 'base' | 'wool';

type TextureEntry = {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  kind: AnimalKind;
  variant: ClimateVariant;
  layer: AnimalTextureLayer;
  faithful?: HTMLCanvasElement;
  url?: string;
  expectedWidth: number;
  expectedHeight: number;
};

const URLS = {
  'cow:temperate': new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/entity/cow/cow_temperate.png', import.meta.url).href,
  'cow:warm': new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/entity/cow/cow_warm.png', import.meta.url).href,
  'cow:cold': new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/entity/cow/cow_cold.png', import.meta.url).href,
  'pig:temperate': new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/entity/pig/pig_temperate.png', import.meta.url).href,
  'pig:warm': new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/entity/pig/pig_warm.png', import.meta.url).href,
  'pig:cold': new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/entity/pig/pig_cold.png', import.meta.url).href,
  'sheep:base': new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/entity/sheep/sheep.png', import.meta.url).href,
  'sheep:wool': new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/entity/sheep/sheep_wool.png', import.meta.url).href,
  'chicken:temperate': new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/entity/chicken/chicken_temperate.png', import.meta.url).href,
  'chicken:warm': new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/entity/chicken/chicken_warm.png', import.meta.url).href,
  'chicken:cold': new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/entity/chicken/chicken_cold.png', import.meta.url).href,
} as const;

export interface AnimalTextureSummary {
  loaded: number;
  missing: string[];
  invalid: string[];
}

export class AnimalTextureLibrary {
  private readonly entries = new Map<string, TextureEntry>();
  private texturePackEnabled = false;
  readonly summary: AnimalTextureSummary = { loaded: 0, missing: [], invalid: [] };

  constructor() {
    for (const kind of ['cow', 'pig', 'chicken'] as const) {
      for (const variant of ['temperate', 'warm', 'cold'] as const) {
        const logicalHeight = kind === 'chicken' ? 32 : 64;
        this.add(
          `${kind}:${variant}`,
          kind,
          variant,
          'base',
          URLS[`${kind}:${variant}`],
          64,
          logicalHeight,
          256,
          kind === 'chicken' ? 128 : 256,
        );
      }
    }
    this.add('sheep:base', 'sheep', 'temperate', 'base', URLS['sheep:base'], 64, 32, 256, 128);
    this.add('sheep:wool', 'sheep', 'temperate', 'wool', URLS['sheep:wool'], 64, 32, 256, 128);
  }

  private add(
    key: string,
    kind: AnimalKind,
    variant: ClimateVariant,
    layer: AnimalTextureLayer,
    url: string,
    width: number,
    height: number,
    expectedWidth: number,
    expectedHeight: number,
  ): void {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    paintFallback(canvas, kind, variant, layer);
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    this.entries.set(key, {
      canvas,
      texture,
      kind,
      variant,
      layer,
      url,
      expectedWidth,
      expectedHeight,
    });
  }

  texture(
    kind: AnimalKind,
    variant: ClimateVariant,
    layer: AnimalTextureLayer = 'base',
  ): THREE.Texture {
    const key = kind === 'sheep' ? `sheep:${layer}` : `${kind}:${variant}`;
    const entry = this.entries.get(key);
    if (!entry) throw new Error(`No animal texture entry for ${key}.`);
    return entry.texture;
  }

  async load(): Promise<AnimalTextureSummary> {
    await Promise.all([...this.entries].map(async ([key, entry]) => {
      if (!entry.url) return;
      try {
        const image = await loadImage(entry.url);
        if (
          image.naturalWidth !== entry.expectedWidth ||
          image.naturalHeight !== entry.expectedHeight
        ) {
          this.summary.invalid.push(key);
          console.warn(
            `[MobTextures] Invalid Faithful texture for ${key} ` +
              `(${image.naturalWidth}x${image.naturalHeight}); using generated fallback.`,
          );
          return;
        }
        const faithful = document.createElement('canvas');
        faithful.width = entry.canvas.width;
        faithful.height = entry.canvas.height;
        const ctx = faithful.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, 0, 0, faithful.width, faithful.height);
        entry.faithful = faithful;
        if (this.texturePackEnabled) this.repaint(entry);
        this.summary.loaded++;
      } catch {
        this.summary.missing.push(key);
        console.warn(
          `[MobTextures] Missing Faithful texture for ${key}. ` +
            'Using generated fallback texture.',
        );
      }
    }));
    if (import.meta.env.DEV) {
      console.info(
        `[MobTextures] ${this.summary.loaded} loaded, ` +
          `${this.summary.missing.length} missing, ${this.summary.invalid.length} invalid.`,
      );
    }
    return this.summary;
  }

  setTexturePackEnabled(enabled: boolean): void {
    if (this.texturePackEnabled === enabled) return;
    this.texturePackEnabled = enabled;
    for (const entry of this.entries.values()) this.repaint(entry);
  }

  get usingTexturePack(): boolean {
    return this.texturePackEnabled;
  }

  private repaint(entry: TextureEntry): void {
    const ctx = entry.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
    ctx.imageSmoothingEnabled = false;
    if (this.texturePackEnabled && entry.faithful) {
      ctx.drawImage(entry.faithful, 0, 0);
    } else {
      paintFallback(entry.canvas, entry.kind, entry.variant, entry.layer);
    }
    entry.texture.needsUpdate = true;
  }

  dispose(): void {
    for (const entry of this.entries.values()) entry.texture.dispose();
    this.entries.clear();
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${url}`));
    image.src = url;
  });
}

function paintFallback(
  canvas: HTMLCanvasElement,
  kind: AnimalKind,
  variant: ClimateVariant,
  layer: AnimalTextureLayer,
): void {
  const ctx = canvas.getContext('2d')!;
  const colors: Record<AnimalKind, Record<ClimateVariant, string>> = {
    cow: { temperate: '#76503a', warm: '#a45f34', cold: '#4f443e' },
    pig: { temperate: '#e79591', warm: '#c98768', cold: '#b87882' },
    sheep: { temperate: '#d8d0bf', warm: '#d8d0bf', cold: '#d8d0bf' },
    chicken: { temperate: '#eee9dc', warm: '#c99352', cold: '#aab7c4' },
  };
  ctx.fillStyle = layer === 'wool' ? '#f1eee4' : colors[kind][variant];
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (layer === 'wool') return;
  const seed = `${kind}:${variant}`.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      const hash = Math.imul(x + seed, 1103515245) ^ Math.imul(y + seed, 12345);
      if ((hash >>> 0) % 13 !== 0) continue;
      ctx.fillStyle = (hash & 1) === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)';
      ctx.fillRect(x, y, 2, 2);
    }
  }
}
