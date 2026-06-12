// 16×16-column, full-height chunk stored as a flat Uint8Array of BlockIds.
import { BlockId } from './Block';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 128;

export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly data: Uint8Array;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
  }

  static index(lx: number, y: number, lz: number): number {
    return (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
  }

  /** Local coords; y outside [0, WORLD_HEIGHT) reads as Air. */
  get(lx: number, y: number, lz: number): BlockId {
    if (y < 0 || y >= WORLD_HEIGHT) return BlockId.Air;
    return this.data[Chunk.index(lx, y, lz)];
  }

  set(lx: number, y: number, lz: number, id: BlockId): void {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    this.data[Chunk.index(lx, y, lz)] = id;
  }
}
