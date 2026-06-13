// Block-texture atlas. Procedural 16×16 tiles are painted with an original
// palette and nearest-upscaled into 64px atlas slots; Faithful 64x textures
// (third-party, see CREDITS.md) overpaint the slots they map to, and any tile
// they don't cover keeps its procedural fallback. One power-of-two atlas.
import * as THREE from 'three';
import { mulberry32, hashSeed, type Rng } from '../core/Rng';
import { BIOME_PAINTERS } from './BiomeTexturePainters';
import type { LoadedFaithful } from './FaithfulTextures';

const TILE = 16; // procedural painters' native resolution
export const ATLAS_TILE = 64; // atlas slot size (Faithful 64x); procedural is upscaled
const ATLAS_TILES = 8; // 8×8 grid leaves room for procedural foliage
const ATLAS_SIZE = ATLAS_TILE * ATLAS_TILES; // 512 px

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
  | 'dead_bush'
  | 'etched_stone';

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

const paintEtchedStone: Painter = (px, rng) => {
  paintStone(px, rng);
  const rune = new Set([
    '7,2', '7,3', '7,4', '4,5', '5,5', '6,5', '7,5', '8,5', '9,5', '10,5',
    '4,6', '7,6', '10,6', '5,7', '7,7', '9,7', '6,8', '7,8', '8,8',
    '7,9', '5,10', '6,10', '7,10', '8,10', '9,10', '5,11', '9,11',
    '6,12', '7,12', '8,12',
  ]);
  for (const key of rune) {
    const [x, y] = key.split(',').map(Number);
    px(x, y, 72, 92, 102);
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
  etched_stone: paintEtchedStone,
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
  private ctx: CanvasRenderingContext2D;
  // Reused 16px scratch for painting/upscaling procedural tiles.
  private scratch: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private waterFrameData: ImageData | null = null;
  // Faithful animated water frames (64×64 each); null → procedural ripple.
  private waterFrames: HTMLCanvasElement[] | null = null;
  private lastWaterFrame = -1;

  constructor(seed = 'claudecraft-textures') {
    this.canvas = document.createElement('canvas');
    this.canvas.width = ATLAS_SIZE;
    this.canvas.height = ATLAS_SIZE;
    const ctx = this.canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false; // crisp nearest upscale 16 → 64
    this.ctx = ctx;

    this.scratch = document.createElement('canvas');
    this.scratch.width = TILE;
    this.scratch.height = TILE;
    this.sctx = this.scratch.getContext('2d')!;

    const names = Object.keys(PAINTERS) as TileName[];
    names.forEach((name, i) => {
      const tx = (i % ATLAS_TILES) * ATLAS_TILE;
      const ty = Math.floor(i / ATLAS_TILES) * ATLAS_TILE;
      const rng = mulberry32(hashSeed(`${seed}:${name}`));
      const img = this.sctx.createImageData(TILE, TILE);
      const px = (x: number, y: number, r: number, g: number, b: number, a = 255) => {
        const o = (y * TILE + x) * 4;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = a;
      };
      PAINTERS[name](px, rng);
      this.sctx.clearRect(0, 0, TILE, TILE);
      this.sctx.putImageData(img, 0, 0);
      ctx.drawImage(this.scratch, 0, 0, TILE, TILE, tx, ty, ATLAS_TILE, ATLAS_TILE);
      this.pixels.set(name, { x: tx, y: ty });
      this.rects.set(name, {
        u0: (tx + 0.5) / ATLAS_SIZE,
        v0: (ty + 0.5) / ATLAS_SIZE,
        u1: (tx + ATLAS_TILE - 0.5) / ATLAS_SIZE,
        v1: (ty + ATLAS_TILE - 0.5) / ATLAS_SIZE,
      });
    });

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.flipY = false; // v0 = canvas top; mesher maps quad tops to v0
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  /**
   * Overpaint mapped slots with loaded Faithful 64x textures (kept as a separate
   * async step so the atlas constructs synchronously and the game boots on the
   * procedural base if the pack is absent or still decoding). UV rects are
   * unchanged — only slot pixels are replaced — so already-meshed chunks update
   * for free once the texture re-uploads. Slots are cleared first so alpha tiles
   * (leaves/glass) don't show procedural pixels through their holes.
   */
  applyFaithful(loaded: LoadedFaithful): void {
    for (const [name, tile] of loaded.tiles) {
      const o = this.pixels.get(name);
      if (!o) continue;
      this.ctx.clearRect(o.x, o.y, ATLAS_TILE, ATLAS_TILE);
      this.ctx.drawImage(tile, o.x, o.y);
    }
    if (loaded.waterFrames) {
      this.waterFrames = loaded.waterFrames;
      this.lastWaterFrame = -1;
    }
    this.texture.needsUpdate = true;
    if (import.meta.env.DEV) {
      const s = loaded.summary;
      console.info(
        `[Faithful] ${s.loaded} mapped textures loaded, ${s.missing} missing, ` +
          `${s.invalid} invalid; unmapped/missing tiles use procedural fallback.`,
      );
    }
  }

  uvRect(name: TileName): UvRect {
    return this.rects.get(name)!;
  }

  /**
   * Repaint just the water tile for a flowing, blocky, vanilla-style animation
   * and re-upload the atlas. Brightness comes from drifting sinusoids plus a
   * moving ripple crest (no per-frame randomness, so frames flow smoothly).
   * The tile keeps the static tile's mean color so per-biome water tint and the
   * material opacity are unchanged. Call on a fixed tick cadence, not per frame.
   */
  animateWater(frame: number): void {
    const o = this.pixels.get('water');
    if (!o) return;

    // Faithful animated water: blit the next 64×64 frame from the loaded strip.
    if (this.waterFrames) {
      const f = ((Math.floor(frame) % this.waterFrames.length) + this.waterFrames.length) % this.waterFrames.length;
      if (f === this.lastWaterFrame) return;
      this.lastWaterFrame = f;
      this.ctx.clearRect(o.x, o.y, ATLAS_TILE, ATLAS_TILE);
      this.ctx.drawImage(this.waterFrames[f], o.x, o.y);
      this.texture.needsUpdate = true;
      return;
    }

    // Procedural ripple fallback: paint 16px then nearest-upscale into the slot.
    if (!this.waterFrameData) this.waterFrameData = this.sctx.createImageData(TILE, TILE);
    const d = this.waterFrameData.data;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const crest = Math.sin((x + y * 2) * 0.8 - frame * 0.5) > 0.6 ? 16 : 0;
        const drift = Math.sin(x * 0.6 + frame * 0.4) + Math.sin(y * 0.5 - frame * 0.3);
        const shade = Math.round(drift * 5); // ±10
        const i = (y * TILE + x) * 4;
        d[i] = Math.max(0, Math.min(255, 46 + (crest >> 1) + shade));
        d[i + 1] = Math.max(0, Math.min(255, 96 + crest + shade));
        d[i + 2] = Math.max(0, Math.min(255, 196 + crest + shade));
        d[i + 3] = 168;
      }
    }
    this.sctx.putImageData(this.waterFrameData, 0, 0);
    this.ctx.drawImage(this.scratch, 0, 0, TILE, TILE, o.x, o.y, ATLAS_TILE, ATLAS_TILE);
    this.texture.needsUpdate = true;
  }

  /** Exact integer source origin for canvas pixel-copy consumers. */
  pixelOrigin(name: TileName): { x: number; y: number } {
    return this.pixels.get(name)!;
  }
}
