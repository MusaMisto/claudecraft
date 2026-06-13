// Faithful 64x texture-pack resolver + loader. Third-party licensed assets used
// under the Faithful License v3 — see CREDITS.md / THIRD_PARTY_LICENSES. Read
// from the local repo only (no runtime downloads).
//
// Detected pack root (one nested folder, with spaces + a hyphen):
//   texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/
//
// Resolution is a STATIC manifest of `new URL(..., import.meta.url)` literals so
// Vite bundles only the ~26 files actually used (not all 1,207 in the pack) and
// no runtime directory enumeration is needed. Missing/invalid files fall back to
// the procedural painters in TextureAtlas, so the game always boots.
import type { TileName } from './TextureAtlas';

// Each entry must be a static literal for Vite to copy + hash the file.
// A template literal with `${}` would glob the whole folder — do not use one.
const URLS: Partial<Record<TileName, string>> = {
  grass_top: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/grass_block_top.png', import.meta.url).href,
  dirt: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/dirt.png', import.meta.url).href,
  stone: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/stone.png', import.meta.url).href,
  cobblestone: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/cobblestone.png', import.meta.url).href,
  planks: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/oak_planks.png', import.meta.url).href,
  log_side: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/oak_log.png', import.meta.url).href,
  log_top: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/oak_log_top.png', import.meta.url).href,
  leaves: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/oak_leaves.png', import.meta.url).href,
  sand: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/sand.png', import.meta.url).href,
  gravel: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/gravel.png', import.meta.url).href,
  glass: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/glass.png', import.meta.url).href,
  snow: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/snow.png', import.meta.url).href,
  ice: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/ice.png', import.meta.url).href,
  cactus_side: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/cactus_side.png', import.meta.url).href,
  cactus_top: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/cactus_top.png', import.meta.url).href,
  birch_log_side: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/birch_log.png', import.meta.url).href,
  birch_log_top: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/birch_log_top.png', import.meta.url).href,
  birch_leaves: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/birch_leaves.png', import.meta.url).href,
  spruce_log_side: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/spruce_log.png', import.meta.url).href,
  spruce_log_top: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/spruce_log_top.png', import.meta.url).href,
  spruce_leaves: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/spruce_leaves.png', import.meta.url).href,
  acacia_log_side: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/acacia_log.png', import.meta.url).href,
  acacia_log_top: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/acacia_log_top.png', import.meta.url).href,
  acacia_leaves: new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/acacia_leaves.png', import.meta.url).href,
};

// grass_side is composited (modern layout: plain dirt + tintable green overlay).
const GRASS_SIDE_URL = new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/grass_block_side.png', import.meta.url).href;
const GRASS_OVERLAY_URL = new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/grass_block_side_overlay.png', import.meta.url).href;
const WATER_STILL_URL = new URL('../../texturepack/Faithful 64x - Release 13/assets/minecraft/textures/block/water_still.png', import.meta.url).href;

export const FAITHFUL_TILE_PX = 64;

/**
 * Faithful's grass top + all leaves are grayscale, designed to be biome-tinted.
 * Claudecraft's biome tints are pale multipliers tuned for its already-green
 * procedural art, so a saturated base green is baked into these grayscale tiles
 * at load; the per-vertex biome tint then varies them across biomes. The grass
 * side overlay is baked with a plains green (the side isn't per-vertex tinted).
 */
const GRASS_BAKE: [number, number, number] = [0x8f, 0xc4, 0x66];
const LEAF_BAKE: [number, number, number] = [0x74, 0xae, 0x50];
const GREEN_TINTED = new Set<TileName>([
  'grass_top', 'leaves', 'birch_leaves', 'spruce_leaves', 'acacia_leaves',
]);

export interface LoadedFaithful {
  /** Normalized 64×64 tiles ready to draw into the atlas. */
  tiles: Map<TileName, HTMLCanvasElement>;
  /** Animated water frames (each 64×64), or null to use the procedural ripple. */
  waterFrames: HTMLCanvasElement[] | null;
  summary: { loaded: number; missing: number; invalid: number };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}

function tileCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = FAITHFUL_TILE_PX;
  c.height = FAITHFUL_TILE_PX;
  return c;
}

/** Multiply every pixel's RGB by `color` (preserving alpha) — used to bake a
 *  saturated base green into Faithful's grayscale grass/leaf tiles. */
function multiply(ctx: CanvasRenderingContext2D, [r, g, b]: [number, number, number]): void {
  const img = ctx.getImageData(0, 0, FAITHFUL_TILE_PX, FAITHFUL_TILE_PX);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = (d[i] * r) / 255;
    d[i + 1] = (d[i + 1] * g) / 255;
    d[i + 2] = (d[i + 2] * b) / 255;
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Load every mapped Faithful texture, normalize to 64×64 canvases, and bake the
 * base green into grass/leaves. Per-file failures are isolated (the slot stays
 * procedural). Resolves even if the whole pack is absent.
 */
export async function loadFaithfulTextures(): Promise<LoadedFaithful> {
  const tiles = new Map<TileName, HTMLCanvasElement>();
  let loaded = 0;
  let invalid = 0;
  let missing = 0;

  const tasks = (Object.entries(URLS) as [TileName, string][]).map(async ([name, url]) => {
    try {
      const img = await loadImage(url);
      if (img.naturalWidth !== FAITHFUL_TILE_PX || img.naturalHeight !== FAITHFUL_TILE_PX) {
        invalid++;
        return;
      }
      const c = tileCanvas();
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);
      if (GREEN_TINTED.has(name)) multiply(ctx, name === 'grass_top' ? GRASS_BAKE : LEAF_BAKE);
      tiles.set(name, c);
      loaded++;
    } catch {
      missing++;
    }
  });

  // grass_side = dirt + tinted overlay (plains green baked in; not per-vertex tinted).
  const grassSide = (async () => {
    try {
      const [side, overlay] = await Promise.all([loadImage(GRASS_SIDE_URL), loadImage(GRASS_OVERLAY_URL)]);
      if (side.naturalWidth !== FAITHFUL_TILE_PX || overlay.naturalWidth !== FAITHFUL_TILE_PX) {
        invalid++;
        return;
      }
      const oc = tileCanvas();
      const octx = oc.getContext('2d')!;
      octx.imageSmoothingEnabled = false;
      octx.drawImage(overlay, 0, 0);
      multiply(octx, GRASS_BAKE);
      const c = tileCanvas();
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(side, 0, 0);
      ctx.drawImage(oc, 0, 0); // alpha-blend the green fringe over the dirt
      tiles.set('grass_side', c);
      loaded++;
    } catch {
      missing++;
    }
  })();

  // water_still: 64×(64·N) vertical animation strip → N frames.
  let waterFrames: HTMLCanvasElement[] | null = null;
  const water = (async () => {
    try {
      const img = await loadImage(WATER_STILL_URL);
      if (img.naturalWidth !== FAITHFUL_TILE_PX || img.naturalHeight % FAITHFUL_TILE_PX !== 0) {
        invalid++;
        return;
      }
      const count = img.naturalHeight / FAITHFUL_TILE_PX;
      const frames: HTMLCanvasElement[] = [];
      for (let i = 0; i < count; i++) {
        const c = tileCanvas();
        const ctx = c.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, i * FAITHFUL_TILE_PX, FAITHFUL_TILE_PX, FAITHFUL_TILE_PX, 0, 0, FAITHFUL_TILE_PX, FAITHFUL_TILE_PX);
        frames.push(c);
      }
      waterFrames = frames;
      tiles.set('water', frames[0]);
      loaded++;
    } catch {
      missing++;
    }
  })();

  await Promise.all([...tasks, grassSide, water]);
  return { tiles, waterFrames, summary: { loaded, missing, invalid } };
}
