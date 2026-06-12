// Procedural 16×16 block textures drawn on a canvas and packed into one
// power-of-two atlas. Original palette and patterns — no external assets.
import * as THREE from 'three';
import { mulberry32, hashSeed, type Rng } from '../core/Rng';

export const TILE = 16;
const ATLAS_TILES = 4; // 4×4 grid of tiles
const ATLAS_SIZE = TILE * ATLAS_TILES; // 64 px

export type TileName =
  | 'grass_top'
  | 'grass_side'
  | 'dirt'
  | 'stone'
  | 'cobblestone'
  | 'planks'
  | 'log_side'
  | 'log_top'
  | 'leaves'
  | 'sand'
  | 'glass'
  | 'water';

/** UV rect in texture space. v0 = top edge, v1 = bottom edge (flipY = false). */
export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

type Painter = (px: (x: number, y: number, r: number, g: number, b: number, a?: number) => void, rng: Rng) => void;

function jitter(rng: Rng, base: number, amount: number): number {
  return Math.max(0, Math.min(255, Math.round(base + (rng() * 2 - 1) * amount)));
}

// --- per-tile painters (original earthy palette) ---

const paintDirtLike =
  (r: number, g: number, b: number, j: number): Painter =>
  (px, rng) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) px(x, y, jitter(rng, r, j), jitter(rng, g, j), jitter(rng, b, j));
  };

const paintGrassTop: Painter = (px, rng) => {
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const v = rng();
      const shade = v < 0.18 ? -22 : v > 0.85 ? 16 : 0;
      px(x, y, jitter(rng, 96 + shade, 10), jitter(rng, 150 + shade, 12), jitter(rng, 64 + shade, 8));
    }
};

const paintGrassSide: Painter = (px, rng) => {
  paintDirtLike(122, 90, 58, 12)(px, rng);
  for (let x = 0; x < TILE; x++) {
    const fringe = 2 + Math.floor(rng() * 3); // ragged 2–4 px green band
    for (let y = 0; y < fringe; y++) px(x, y, jitter(rng, 96, 10), jitter(rng, 150, 12), jitter(rng, 64, 8));
  }
};

const paintStone: Painter = (px, rng) => {
  // gray noise with a few darker blotches
  const blotches: Array<[number, number]> = [];
  for (let i = 0; i < 4; i++) blotches.push([rng() * TILE, rng() * TILE]);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      let base = 138;
      for (const [bx, by] of blotches) {
        const d = (x - bx) ** 2 + (y - by) ** 2;
        if (d < 7) base -= 16;
      }
      const v = jitter(rng, base, 9);
      px(x, y, v, v, jitter(rng, base + 2, 9));
    }
};

const paintCobblestone: Painter = (px, rng) => {
  // irregular stones separated by darker mortar lines
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const wx = x + Math.floor(rng() * 2);
      const wy = y + Math.floor(rng() * 2);
      const mortar = wx % 5 === 0 || wy % 5 === 0 || (wx + wy) % 9 === 0;
      const base = mortar ? 84 : 130;
      const v = jitter(rng, base, 10);
      px(x, y, v, v, v);
    }
};

const paintPlanks: Painter = (px, rng) => {
  for (let y = 0; y < TILE; y++) {
    const band = Math.floor(y / 4);
    const seamRow = y % 4 === 3;
    const seamCol = (band % 2 === 0 ? 7 : 12) % TILE;
    for (let x = 0; x < TILE; x++) {
      if (seamRow || x === seamCol) {
        px(x, y, jitter(rng, 108, 6), jitter(rng, 78, 6), jitter(rng, 42, 5));
      } else {
        px(x, y, jitter(rng, 168, 10), jitter(rng, 128, 9), jitter(rng, 76, 8));
      }
    }
  }
};

const paintLogSide: Painter = (px, rng) => {
  for (let x = 0; x < TILE; x++) {
    const stripe = Math.sin(x * 1.9) > 0.2;
    for (let y = 0; y < TILE; y++) {
      const dark = stripe || rng() < 0.08;
      const base = dark ? 88 : 116;
      px(x, y, jitter(rng, base, 8), jitter(rng, base - 22, 7), jitter(rng, base - 52, 6));
    }
  }
};

const paintLogTop: Painter = (px, rng) => {
  const c = (TILE - 1) / 2;
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const d = Math.sqrt((x - c) ** 2 + (y - c) ** 2);
      if (d > 7.2) {
        px(x, y, jitter(rng, 98, 8), jitter(rng, 74, 7), jitter(rng, 44, 6)); // bark rim
      } else {
        const ring = Math.floor(d) % 2 === 0;
        const base = ring ? 188 : 160;
        px(x, y, jitter(rng, base, 7), jitter(rng, base - 44, 7), jitter(rng, base - 102, 6));
      }
    }
};

const paintLeaves: Painter = (px, rng) => {
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      if (rng() < 0.22) {
        px(x, y, 0, 0, 0, 0); // scattered holes (alpha-tested)
      } else {
        const shade = rng() < 0.3 ? -20 : 0;
        px(x, y, jitter(rng, 70 + shade, 10), jitter(rng, 120 + shade, 12), jitter(rng, 52 + shade, 8));
      }
    }
};

const paintSand = paintDirtLike(214, 200, 150, 9);

const paintGlass: Painter = (px, rng) => {
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const border = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
      const shine = (x + y === 5 && x < 5) || (x + y === 7 && x < 7);
      if (border) px(x, y, jitter(rng, 196, 6), jitter(rng, 222, 6), jitter(rng, 228, 6), 255);
      else if (shine) px(x, y, 235, 248, 250, 170);
      else px(x, y, 0, 0, 0, 0);
    }
};

const paintWater: Painter = (px, rng) => {
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const ripple = Math.sin((x + y * 2) * 0.8) > 0.6 ? 14 : 0;
      px(x, y, jitter(rng, 46 + ripple, 6), jitter(rng, 96 + ripple, 7), jitter(rng, 196 + ripple, 8), 168);
    }
};

const PAINTERS: Record<TileName, Painter> = {
  grass_top: paintGrassTop,
  grass_side: paintGrassSide,
  dirt: paintDirtLike(122, 90, 58, 12),
  stone: paintStone,
  cobblestone: paintCobblestone,
  planks: paintPlanks,
  log_side: paintLogSide,
  log_top: paintLogTop,
  leaves: paintLeaves,
  sand: paintSand,
  glass: paintGlass,
  water: paintWater,
};

export class TextureAtlas {
  readonly texture: THREE.CanvasTexture;
  readonly canvas: HTMLCanvasElement;
  private rects = new Map<TileName, UvRect>();

  constructor(seed = 'claudecraft-textures') {
    this.canvas = document.createElement('canvas');
    this.canvas.width = ATLAS_SIZE;
    this.canvas.height = ATLAS_SIZE;
    const ctx = this.canvas.getContext('2d')!;
    const img = ctx.createImageData(ATLAS_SIZE, ATLAS_SIZE);

    const names = Object.keys(PAINTERS) as TileName[];
    names.forEach((name, i) => {
      const tx = (i % ATLAS_TILES) * TILE;
      const ty = Math.floor(i / ATLAS_TILES) * TILE;
      const rng = mulberry32(hashSeed(`${seed}:${name}`));
      const px = (x: number, y: number, r: number, g: number, b: number, a = 255) => {
        const o = ((ty + y) * ATLAS_SIZE + tx + x) * 4;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = a;
      };
      PAINTERS[name](px, rng);
      this.rects.set(name, {
        u0: tx / ATLAS_SIZE,
        v0: ty / ATLAS_SIZE,
        u1: (tx + TILE) / ATLAS_SIZE,
        v1: (ty + TILE) / ATLAS_SIZE,
      });
    });
    ctx.putImageData(img, 0, 0);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.flipY = false; // v0 = canvas top; mesher maps quad tops to v0
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  uvRect(name: TileName): UvRect {
    return this.rects.get(name)!;
  }
}
