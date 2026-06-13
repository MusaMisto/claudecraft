// Procedural 16×16 block textures drawn on a canvas and packed into one
// power-of-two atlas. Original palette and patterns — no external assets.
import * as THREE from 'three';
import { mulberry32, hashSeed, type Rng } from '../core/Rng';
import { BIOME_PAINTERS } from './BiomeTexturePainters';

export const TILE = 16;
const ATLAS_TILES = 8; // 8×8 grid leaves room for procedural foliage
const ATLAS_SIZE = TILE * ATLAS_TILES; // 128 px

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
  | 'gravel'
  | 'glass'
  | 'water'
  | 'short_grass'
  | 'tall_grass'
  | 'fern'
  | 'bush'
  | 'dandelion'
  | 'poppy'
  | 'cornflower'
  | 'oxeye_daisy'
  | 'wildflowers'
  | 'snow'
  | 'ice'
  | 'cactus_side'
  | 'cactus_top'
  | 'birch_log_side'
  | 'birch_log_top'
  | 'birch_leaves'
  | 'spruce_log_side'
  | 'spruce_log_top'
  | 'spruce_leaves'
  | 'acacia_log_side'
  | 'acacia_log_top'
  | 'acacia_leaves'
  | 'dry_grass'
  | 'dead_bush';

/** UV rect in texture space. v0 = top edge, v1 = bottom edge (flipY = false). */
export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export type Painter = (px: (x: number, y: number, r: number, g: number, b: number, a?: number) => void, rng: Rng) => void;
type Pixel = [r: number, g: number, b: number, a?: number];

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

// Gravel: small gray-brown pebbles clustered over darker gaps — clearly
// distinct from stone (uniform gray noise) and cobblestone (mortar grid).
const paintGravel: Painter = (px, rng) => {
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) px(x, y, jitter(rng, 74, 7), jitter(rng, 70, 7), jitter(rng, 64, 7));
  for (let i = 0; i < 16; i++) {
    const cx = rng() * TILE;
    const cy = rng() * TILE;
    const radius = 1.1 + rng() * 1.7;
    const tone = rng();
    const base = tone < 0.4 ? 150 : tone < 0.75 ? 122 : 96;
    const r2 = radius * radius;
    for (let y = Math.floor(cy - radius); y <= cy + radius; y++)
      for (let x = Math.floor(cx - radius); x <= cx + radius; x++) {
        if (x < 0 || x >= TILE || y < 0 || y >= TILE) continue;
        if ((x - cx) ** 2 + (y - cy) ** 2 > r2) continue;
        px(x, y, jitter(rng, base + 6, 12), jitter(rng, base, 11), jitter(rng, base - 12, 10));
      }
  }
};

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

function plantPixel(px: Parameters<Painter>[0], x: number, y: number, color: Pixel): void {
  if (x < 0 || x >= TILE || y < 0 || y >= TILE) return;
  px(x, y, ...color);
}

const paintShortGrass: Painter = (px, rng) => {
  for (const x of [2, 5, 7, 10, 13]) {
    const height = 6 + Math.floor(rng() * 5);
    const color: Pixel = rng() < 0.45 ? [69, 132, 55] : [86, 151, 62];
    for (let i = 0; i < height; i++) {
      const bend = i > height * 0.55 ? (x % 2 === 0 ? -1 : 1) : 0;
      plantPixel(px, x + bend, 15 - i, color);
      if (i < 3) plantPixel(px, x + 1, 15 - i, color);
    }
  }
};

const paintTallGrass: Painter = (px, rng) => {
  for (const x of [1, 4, 7, 9, 12, 14]) {
    const height = 11 + Math.floor(rng() * 5);
    const color: Pixel = rng() < 0.5 ? [62, 124, 50] : [82, 148, 59];
    for (let i = 0; i < height; i++) {
      const bend = i > height * 0.7 ? (x < 8 ? -1 : 1) : 0;
      plantPixel(px, x + bend, 15 - i, color);
    }
  }
};

const paintFern: Painter = (px, rng) => {
  const stem: Pixel = [62, 119, 50];
  for (let y = 3; y < TILE; y++) plantPixel(px, 8, y, stem);
  for (const y of [5, 8, 11, 14]) {
    const reach = Math.max(2, Math.floor((16 - y) * 0.55));
    const leaf: Pixel = rng() < 0.5 ? [70, 132, 55] : [82, 143, 58];
    for (let i = 1; i <= reach; i++) {
      plantPixel(px, 8 - i, y + Math.floor(i / 3), leaf);
      plantPixel(px, 8 + i, y + Math.floor(i / 3), leaf);
    }
  }
};

const paintBush: Painter = (px, rng) => {
  for (let y = 4; y < 16; y++) {
    for (let x = 1; x < 15; x++) {
      const dx = (x - 7.5) / 7;
      const dy = (y - 10) / 6;
      if (dx * dx + dy * dy > 1 || rng() < 0.14) continue;
      const shade = rng() < 0.3 ? -16 : 0;
      px(x, y, 70 + shade, 128 + shade, 54 + shade);
    }
  }
};

function flowerPainter(petal: Pixel, center: Pixel): Painter {
  return (px, rng) => {
    const stem: Pixel = [62, 128, 51];
    for (let y = 7; y < 16; y++) plantPixel(px, 8, y, stem);
    plantPixel(px, 7, 11, stem);
    plantPixel(px, 9, 13, stem);
    for (const [dx, dy] of [[0, -2], [-2, 0], [2, 0], [0, 2], [-1, -1], [1, -1]]) {
      const jittered: Pixel = [
        jitter(rng, petal[0], 8),
        jitter(rng, petal[1], 8),
        jitter(rng, petal[2], 8),
      ];
      plantPixel(px, 8 + dx, 5 + dy, jittered);
    }
    plantPixel(px, 8, 5, center);
    plantPixel(px, 7, 5, center);
  };
}

const paintWildflowers: Painter = (px, rng) => {
  for (const [x, top] of [[3, 7], [7, 4], [11, 8], [14, 6]]) {
    const stem: Pixel = [67, 132, 54];
    for (let y = top + 1; y < 16; y++) plantPixel(px, x, y, stem);
    const gold: Pixel = [jitter(rng, 236, 8), jitter(rng, 194, 9), jitter(rng, 66, 6)];
    plantPixel(px, x, top, gold);
    plantPixel(px, x - 1, top + 1, gold);
    plantPixel(px, x + 1, top + 1, gold);
  }
};

const PAINTERS = {
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
  gravel: paintGravel,
  glass: paintGlass,
  water: paintWater,
  short_grass: paintShortGrass,
  tall_grass: paintTallGrass,
  fern: paintFern,
  bush: paintBush,
  dandelion: flowerPainter([238, 201, 55], [171, 128, 42]),
  poppy: flowerPainter([205, 52, 55], [104, 45, 42]),
  cornflower: flowerPainter([72, 109, 207], [48, 67, 142]),
  oxeye_daisy: flowerPainter([236, 235, 211], [224, 171, 48]),
  wildflowers: paintWildflowers,
  ...BIOME_PAINTERS,
} as Record<TileName, Painter>;

export class TextureAtlas {
  readonly texture: THREE.CanvasTexture;
  readonly canvas: HTMLCanvasElement;
  private rects = new Map<TileName, UvRect>();
  private pixels = new Map<TileName, { x: number; y: number }>();

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
      this.pixels.set(name, { x: tx, y: ty });
      this.rects.set(name, {
        u0: (tx + 0.5) / ATLAS_SIZE,
        v0: (ty + 0.5) / ATLAS_SIZE,
        u1: (tx + TILE - 0.5) / ATLAS_SIZE,
        v1: (ty + TILE - 0.5) / ATLAS_SIZE,
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

  /** Exact integer source origin for canvas pixel-copy consumers. */
  pixelOrigin(name: TileName): { x: number; y: number } {
    return this.pixels.get(name)!;
  }
}
