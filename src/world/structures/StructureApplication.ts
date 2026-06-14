import { BlockId } from '../Block';
import { Chunk, CHUNK_SIZE, WORLD_HEIGHT } from '../Chunk';
import type { ReplaceRule, StructureBlock } from './Structure';

const VEGETATION = new Set<BlockId>([
  BlockId.Log,
  BlockId.Leaves,
  BlockId.BirchLog,
  BlockId.BirchLeaves,
  BlockId.SpruceLog,
  BlockId.SpruceLeaves,
  BlockId.AcaciaLog,
  BlockId.AcaciaLeaves,
  BlockId.Cactus,
]);

const NATURAL = new Set<BlockId>([
  BlockId.Grass,
  BlockId.Dirt,
  BlockId.Stone,
  BlockId.Cobblestone,
  BlockId.Sand,
  BlockId.Gravel,
  BlockId.Snow,
  BlockId.Ice,
  ...VEGETATION,
]);

const PATH_SURFACES = new Set<BlockId>([
  BlockId.Grass,
  BlockId.Dirt,
  BlockId.Sand,
  BlockId.Gravel,
  BlockId.Snow,
]);

function canReplace(existing: BlockId, rule: ReplaceRule): boolean {
  if (rule === 'always') return true;
  if (rule === 'air_or_vegetation') return existing === BlockId.Air || VEGETATION.has(existing);
  if (rule === 'natural') return existing === BlockId.Air || NATURAL.has(existing);
  if (rule === 'path') return PATH_SURFACES.has(existing);
  if (rule === 'clear') return existing !== BlockId.Water && existing !== BlockId.Ice;
  if (rule === 'foundation') {
    return existing !== BlockId.Water && (existing === BlockId.Air || NATURAL.has(existing));
  }
  return existing !== BlockId.Water && existing !== BlockId.Ice;
}

export function applyStructureBlocksToChunk(chunk: Chunk, blocks: readonly StructureBlock[]): number {
  const minX = chunk.cx * CHUNK_SIZE;
  const minZ = chunk.cz * CHUNK_SIZE;
  let applied = 0;
  for (const block of blocks) {
    if (
      block.x < minX ||
      block.x >= minX + CHUNK_SIZE ||
      block.z < minZ ||
      block.z >= minZ + CHUNK_SIZE ||
      block.y < 0 ||
      block.y >= WORLD_HEIGHT
    ) {
      continue;
    }
    const lx = block.x - minX;
    const lz = block.z - minZ;
    const existing = chunk.get(lx, block.y, lz);
    if (!canReplace(existing, block.replaceRule) || existing === block.block) continue;
    chunk.set(lx, block.y, lz, block.block);
    applied++;
  }
  return applied;
}
