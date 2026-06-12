// Seeded simplex-noise heightmap terrain: rolling hills, beaches, water
// fill, and deterministic scattered oak trees.
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32, hashSeed } from '../core/Rng';
import { BlockId } from './Block';
import { Chunk, CHUNK_SIZE, WORLD_HEIGHT } from './Chunk';

export const SEA_LEVEL = 62;

const OCTAVES = 4;
const BASE_WAVELENGTH = 200;
const PERSISTENCE = 0.5;
const LACUNARITY = 2;

// Trees: ~1 per 60 grass columns, canopy radius 2 → margin for border trees.
const TREE_CHANCE = 1 / 60;
const TREE_MARGIN = 2;

export class TerrainGenerator {
  private noise2D: NoiseFunction2D;
  private treeSalt: number;

  constructor(seed: string | number = 'claudecraft') {
    this.noise2D = createNoise2D(mulberry32(hashSeed(String(seed))));
    this.treeSalt = hashSeed(`${seed}:trees`);
  }

  /** Deterministic per-column hash in [0, 1) (murmur3-style finalizer). */
  private columnHash(x: number, z: number): number {
    let h = this.treeSalt;
    h = Math.imul(h ^ x, 0x01000193);
    h = Math.imul(h ^ z, 0x01000193);
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  /** Surface height (y of the top solid block) for a world column. */
  height(x: number, z: number): number {
    let amp = 1;
    let freq = 1 / BASE_WAVELENGTH;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < OCTAVES; i++) {
      sum += this.noise2D(x * freq, z * freq) * amp;
      norm += amp;
      amp *= PERSISTENCE;
      freq *= LACUNARITY;
    }
    const n = sum / norm; // ~[-1, 1]
    const h = Math.round(SEA_LEVEL + 2 + n * 17); // ~y 47–81, centered near sea level
    return Math.max(1, Math.min(WORLD_HEIGHT - 2, h));
  }

  /** Fill a chunk's block data in place. */
  generate(chunk: Chunk): void {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const h = this.height(ox + lx, oz + lz);
        const beach = h <= SEA_LEVEL + 1; // sand top at/below y 63
        for (let y = 0; y <= h; y++) {
          let id: BlockId;
          if (y === h) id = beach ? BlockId.Sand : BlockId.Grass;
          else if (y >= h - 3) id = BlockId.Dirt;
          else id = BlockId.Stone;
          chunk.set(lx, y, lz, id);
        }
        for (let y = h + 1; y <= SEA_LEVEL; y++) {
          chunk.set(lx, y, lz, BlockId.Water);
        }
      }
    }
    this.plantTrees(chunk, ox, oz);
  }

  /**
   * Write the parts of any nearby trees that fall inside this chunk.
   * Placement is a pure function of world column, so neighbouring chunks
   * agree on trees that straddle their border.
   */
  private plantTrees(chunk: Chunk, ox: number, oz: number): void {
    for (let dz = -TREE_MARGIN; dz < CHUNK_SIZE + TREE_MARGIN; dz++) {
      for (let dx = -TREE_MARGIN; dx < CHUNK_SIZE + TREE_MARGIN; dx++) {
        const wx = ox + dx;
        const wz = oz + dz;
        const hash = this.columnHash(wx, wz);
        if (hash >= TREE_CHANCE) continue;
        const h = this.height(wx, wz);
        if (h <= SEA_LEVEL + 1) continue; // grass only, not beach/underwater

        const trunkHeight = 4 + Math.floor((hash / TREE_CHANCE) * 3); // 4–6
        const top = h + trunkHeight;
        if (top + 2 >= WORLD_HEIGHT) continue;

        const put = (x: number, y: number, z: number, id: BlockId, keepExisting = false) => {
          const lx = x - ox;
          const lz = z - oz;
          if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
          if (keepExisting && chunk.get(lx, y, lz) !== BlockId.Air) return;
          chunk.set(lx, y, lz, id);
        };

        // Canopy: two 5×5-ish layers below/at the top, a 3×3 cap above.
        for (let y = top - 1; y <= top + 1; y++) {
          const r = y <= top ? 2 : 1;
          for (let cz = -r; cz <= r; cz++) {
            for (let cx = -r; cx <= r; cx++) {
              if (Math.abs(cx) === 2 && Math.abs(cz) === 2 && (y + cx + cz) % 2 === 0) continue; // ragged corners
              put(wx + cx, y, wz + cz, BlockId.Leaves, true);
            }
          }
        }
        put(wx, top + 2, wz, BlockId.Leaves, true);

        // Trunk last so it overwrites canopy cells.
        for (let y = h + 1; y <= top; y++) put(wx, y, wz, BlockId.Log);
      }
    }
  }
}
