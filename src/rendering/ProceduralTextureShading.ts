import type { Rng } from '../core/Rng';
import type { TileName } from './TextureAtlas';

const TILE = 16;

const FOLIAGE_TILE_NAMES = new Set<TileName>([
  'short_grass',
  'tall_grass',
  'fern',
  'bush',
  'dandelion',
  'poppy',
  'cornflower',
  'oxeye_daisy',
  'wildflowers',
  'dry_grass',
  'dead_bush',
]);

const UNSHADED_TILES = new Set<TileName>(['glass', 'water']);
const STRONG_RELIEF_TILES = new Set<TileName>([
  'cobblestone',
  'planks',
  'log_side',
  'log_top',
  'birch_log_side',
  'birch_log_top',
  'spruce_log_side',
  'spruce_log_top',
  'acacia_log_side',
  'acacia_log_top',
  'cactus_side',
  'cactus_top',
]);
const SOFT_SHADE_TILES = new Set<TileName>([
  'grass_top',
  'grass_side',
  'dirt',
  'sand',
  'snow',
  'leaves',
  'birch_leaves',
  'spruce_leaves',
  'acacia_leaves',
]);

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const luminanceAt = (data: Uint8ClampedArray, x: number, y: number): number => {
  const sx = Math.max(0, Math.min(TILE - 1, x));
  const sy = Math.max(0, Math.min(TILE - 1, y));
  const offset = (sy * TILE + sx) * 4;
  return data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
};

/**
 * Give the procedural pack clustered highlights and inset shadows so its
 * materials read clearly at block scale. Faithful art is applied later.
 */
export function shadeProceduralTile(name: TileName, image: ImageData, rng: Rng): void {
  if (UNSHADED_TILES.has(name)) return;
  const source = new Uint8ClampedArray(image.data);
  const softShade = SOFT_SHADE_TILES.has(name);
  const clusterSize = softShade ? 5 : 4;
  const clusterWidth = Math.ceil(TILE / clusterSize) + 1;
  const clusterHeight = Math.ceil(TILE / clusterSize) + 1;
  const clusters = Array.from(
    { length: clusterWidth * clusterHeight },
    () => (rng() * 2 - 1) * 11,
  );
  const reliefGain = STRONG_RELIEF_TILES.has(name) ? 0.22 : 0.13;
  const bevelGain = name.includes('leaves') || FOLIAGE_TILE_NAMES.has(name) ? 7 : 4;

  const clusterAt = (x: number, y: number): number => {
    const gx = x / clusterSize;
    const gy = y / clusterSize;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = gx - x0;
    const ty = gy - y0;
    const sample = (sx: number, sy: number) =>
      clusters[Math.min(clusterHeight - 1, sy) * clusterWidth + Math.min(clusterWidth - 1, sx)];
    const top = sample(x0, y0) * (1 - tx) + sample(x0 + 1, y0) * tx;
    const bottom = sample(x0, y0 + 1) * (1 - tx) + sample(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };

  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const offset = (y * TILE + x) * 4;
      if (source[offset + 3] === 0) continue;

      const relief =
        (luminanceAt(source, x - 1, y) + luminanceAt(source, x, y - 1) -
          luminanceAt(source, x + 1, y) - luminanceAt(source, x, y + 1)) *
        reliefGain;
      const alphaEdge =
        (x > 0 && source[offset - 1] === 0 ? bevelGain : 0) +
        (y > 0 && source[offset - TILE * 4 + 3] === 0 ? bevelGain : 0) -
        (x < TILE - 1 && source[offset + 7] === 0 ? bevelGain : 0) -
        (y < TILE - 1 && source[offset + TILE * 4 + 3] === 0 ? bevelGain : 0);
      const shade = clusterAt(x, y) + relief + alphaEdge;
      image.data[offset] = clampByte(source[offset] + shade);
      image.data[offset + 1] = clampByte(source[offset + 1] + shade);
      image.data[offset + 2] = clampByte(source[offset + 2] + shade);
    }
  }
}
