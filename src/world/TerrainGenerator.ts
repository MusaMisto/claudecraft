// Seeded simplex-noise heightmap terrain: rolling hills, beaches, water fill.
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32, hashSeed } from '../core/Rng';
import { BlockId } from './Block';
import { Chunk, CHUNK_SIZE, WORLD_HEIGHT } from './Chunk';

export const SEA_LEVEL = 62;

const OCTAVES = 4;
const BASE_WAVELENGTH = 200;
const PERSISTENCE = 0.5;
const LACUNARITY = 2;

export class TerrainGenerator {
  private noise2D: NoiseFunction2D;

  constructor(seed: string | number = 'claudecraft') {
    this.noise2D = createNoise2D(mulberry32(hashSeed(String(seed))));
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
  }
}
