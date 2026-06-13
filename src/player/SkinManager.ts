// Owns the single shared player-skin texture used by the menu preview and the
// in-game first-person hand. Loads docs/skin.png as the default, validates and
// applies 64×64 PNG uploads, persists the selection in localStorage, and
// notifies subscribers when the skin changes. All skin textures are
// nearest-filtered, mip-free, and flipY=false to match the SkinUv layout.
import * as THREE from 'three';
import { defaultSkinUrl } from '../assets/assets';

export type SkinModelType = 'classic' | 'slim';
export type SkinSource = 'default' | 'uploaded' | 'generated-fallback';

export interface SkinState {
  texture: THREE.Texture;
  source: SkinSource;
  name: string;
  modelType: SkinModelType;
}

/** Thrown by loadUploadedSkin with a user-facing message for the UI. */
export class SkinError extends Error {}

const SKIN_SIZE = 64;
const STORAGE_KEY = 'claudecraft.skin.v1';

interface PersistedSkin {
  dataUrl: string;
  name: string;
  modelType: SkinModelType;
}

export class SkinManager {
  private state: SkinState;
  private listeners = new Set<(s: SkinState) => void>();

  constructor() {
    // A valid texture exists synchronously from construction so renderers never
    // see a null skin; the default/persisted skin replaces it asynchronously.
    this.state = {
      texture: makeSkinTexture(buildFallbackSkin()),
      source: 'generated-fallback',
      name: 'Default (generated)',
      modelType: 'classic',
    };
    void this.init();
  }

  /** Prefer a persisted upload, else docs/skin.png, else the generated fallback. */
  private async init(): Promise<void> {
    const persisted = readPersisted();
    if (persisted) {
      try {
        const img = await decodeImage(persisted.dataUrl);
        if (img.width === SKIN_SIZE && img.height === SKIN_SIZE) {
          this.apply(makeSkinTexture(img), 'uploaded', persisted.name, persisted.modelType);
          return;
        }
      } catch {
        /* fall through to the default skin */
      }
    }
    try {
      const img = await decodeImage(defaultSkinUrl);
      if (img.width !== SKIN_SIZE || img.height !== SKIN_SIZE) {
        console.warn(
          `Claudecraft: docs/skin.png is ${img.width}×${img.height}, expected 64×64 — using a generated fallback skin.`,
        );
        return;
      }
      this.apply(makeSkinTexture(img), 'default', 'Default', 'classic');
    } catch {
      console.warn('Claudecraft: docs/skin.png missing or unreadable — using a generated fallback skin.');
    }
  }

  /**
   * Validate and apply an uploaded skin file. Resolves with the new state, or
   * rejects with a SkinError whose message is safe to show in the UI.
   */
  async loadUploadedSkin(file: File): Promise<SkinState> {
    const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
    if (!isPng) {
      throw new SkinError('Please upload a 64×64 PNG skin.');
    }
    let img: ImageBitmap | HTMLImageElement;
    try {
      img = await decodeImage(file);
    } catch {
      throw new SkinError('Could not read this PNG file.');
    }
    if (img.width !== SKIN_SIZE || img.height !== SKIN_SIZE) {
      throw new SkinError(
        `This image is ${img.width}×${img.height}. Claudecraft currently supports 64×64 skins only.`,
      );
    }
    const canvas = drawToSkinCanvas(img);
    const texture = makeSkinTexture(canvas);
    const name = file.name.replace(/\.png$/i, '');
    this.apply(texture, 'uploaded', name, 'classic');
    persist({ dataUrl: canvas.toDataURL('image/png'), name, modelType: 'classic' });
    return this.state;
  }

  /** Replace the current skin texture, notify listeners, then dispose the old one. */
  private apply(texture: THREE.Texture, source: SkinSource, name: string, modelType: SkinModelType): void {
    const previous = this.state.texture;
    this.state = { texture, source, name, modelType };
    for (const fn of this.listeners) fn(this.state);
    if (previous !== texture) previous.dispose();
  }

  getCurrentSkin(): SkinState {
    return this.state;
  }

  get texture(): THREE.Texture {
    return this.state.texture;
  }

  /** Subscribe to skin changes; the listener is invoked immediately with the
   *  current state and on every subsequent change. Returns an unsubscribe fn. */
  subscribe(listener: (s: SkinState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }
}

// --- texture helpers ---

function makeSkinTexture(source: CanvasImageSource): THREE.CanvasTexture {
  const canvas = source instanceof HTMLCanvasElement ? source : drawToSkinCanvas(source);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false; // v measured from the top, matching SkinUv + the block atlas
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function drawToSkinCanvas(source: CanvasImageSource): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SKIN_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, SKIN_SIZE, SKIN_SIZE);
  ctx.drawImage(source, 0, 0, SKIN_SIZE, SKIN_SIZE);
  return canvas;
}

function decodeImage(src: string | File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function' && src instanceof File) {
    return createImageBitmap(src);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = typeof src === 'string' ? src : URL.createObjectURL(src);
  });
}

// --- persistence ---

function readPersisted(): PersistedSkin | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSkin;
    if (typeof parsed?.dataUrl !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function persist(skin: PersistedSkin): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(skin));
  } catch {
    /* storage full / unavailable — selection simply won't survive a reload */
  }
}

// --- generated fallback skin (original colors, classic 64×64 layout) ---

/** Paint a recognizable clothed character into the standard base-layer regions
 *  so the game looks intentional when docs/skin.png is absent. Original palette. */
function buildFallbackSkin(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SKIN_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, SKIN_SIZE, SKIN_SIZE);

  const SKIN = '#c8966e';
  const HAIR = '#5a3a24';
  const SHIRT = '#3f9b8e';
  const PANTS = '#39507a';
  const fill = (c: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };

  // Head net: top/bottom (8..24, 0..8), sides+front+back (0..32, 8..16).
  fill(SKIN, 8, 0, 16, 8);
  fill(SKIN, 0, 8, 32, 8);
  fill(HAIR, 8, 0, 16, 3); // hair cap on the top + a fringe over the face
  fill(HAIR, 8, 8, 16, 2);
  // Face features on the front (origin 8,8, 8×8).
  fill('#ffffff', 10, 12, 2, 1);
  fill('#ffffff', 14, 12, 2, 1);
  fill('#37618f', 11, 12, 1, 1);
  fill('#37618f', 14, 12, 1, 1);
  fill('#7a5a44', 11, 14, 4, 1); // mouth

  // Body net (16..40, 16..32): shirt.
  fill(SHIRT, 16, 16, 24, 16);
  // Right arm net (40..56, 16..32): shirt sleeve over skin hand.
  fill(SHIRT, 40, 16, 16, 12);
  fill(SKIN, 40, 28, 16, 4);
  // Right leg net (0..16, 16..32): pants.
  fill(PANTS, 0, 16, 16, 16);
  // Left leg net (16..32, 48..64): pants.
  fill(PANTS, 16, 48, 16, 16);
  // Left arm net (32..48, 48..64): shirt sleeve over skin hand.
  fill(SHIRT, 32, 48, 16, 12);
  fill(SKIN, 32, 60, 16, 4);

  return canvas;
}
