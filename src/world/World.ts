// Chunk map with world-space block access and dirty-chunk tracking.
import { BlockId } from './Block';
import { Chunk, CHUNK_SIZE, WORLD_HEIGHT } from './Chunk';
import type { TerrainGenerator } from './TerrainGenerator';

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export class World {
  readonly chunks = new Map<string, Chunk>();
  /** Chunk keys whose meshes need rebuilding. */
  readonly dirty = new Set<string>();

  constructor(readonly generator?: TerrainGenerator) {}

  /** Get the chunk, generating its terrain first if it doesn't exist yet. */
  ensureChunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.generator?.generate(chunk);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  getOrCreateChunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  removeChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    this.chunks.delete(key);
    this.dirty.delete(key);
  }

  /** World-space read; unloaded chunks and out-of-range y read as Air. */
  getBlock(x: number, y: number, z: number): BlockId {
    if (y < 0 || y >= WORLD_HEIGHT) return BlockId.Air;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return BlockId.Air;
    return chunk.get(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE);
  }

  /**
   * World-space write into an existing chunk. Marks the chunk dirty, plus any
   * neighbor chunk(s) the edited block borders so their meshes re-cull faces.
   */
  setBlock(x: number, y: number, z: number, id: BlockId): void {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return;
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    chunk.set(lx, y, lz, id);
    this.dirty.add(chunkKey(cx, cz));
    if (lx === 0) this.dirty.add(chunkKey(cx - 1, cz));
    if (lx === CHUNK_SIZE - 1) this.dirty.add(chunkKey(cx + 1, cz));
    if (lz === 0) this.dirty.add(chunkKey(cx, cz - 1));
    if (lz === CHUNK_SIZE - 1) this.dirty.add(chunkKey(cx, cz + 1));
  }
}
