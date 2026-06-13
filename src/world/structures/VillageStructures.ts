import type { Rng } from '../../core/Rng';
import { BiomeId } from '../Biome';
import { BlockId } from '../Block';
import type { StructureId } from './Structure';
import type { StructureBuilder } from './StructureBuilder';
import type { StructureFactory } from './StructureGenerator';

function villageLog(biome: BiomeId): BlockId {
  if (biome === BiomeId.Taiga) return BlockId.SpruceLog;
  if (biome === BiomeId.Savanna) return BlockId.AcaciaLog;
  if (biome === BiomeId.BirchForest) return BlockId.BirchLog;
  return BlockId.Log;
}

function house(builder: StructureBuilder, cx: number, cz: number, log: BlockId, windowSide: -1 | 1): void {
  const x1 = cx - 3;
  const x2 = cx + 3;
  const z1 = cz - 2;
  const z2 = cz + 2;
  builder.supportedFloor(x1, z1, x2, z2, 0, BlockId.Planks);
  builder.clear(x1 + 1, 1, z1 + 1, x2 - 1, 4, z2 - 1);

  for (let y = 1; y <= 4; y++) {
    for (let x = x1; x <= x2; x++) {
      const frontDoor = z2 === cz + 2 && x === cx && y <= 2;
      if (!frontDoor) builder.block(x, y, z2, x === x1 || x === x2 ? log : BlockId.Planks);
      builder.block(x, y, z1, x === x1 || x === x2 ? log : BlockId.Planks);
    }
    for (let z = z1 + 1; z < z2; z++) {
      builder.block(x1, y, z, z === cz && y === 2 ? BlockId.Glass : BlockId.Planks);
      builder.block(x2, y, z, z === cz && y === 2 ? BlockId.Glass : BlockId.Planks);
    }
  }
  builder.block(cx + windowSide * 2, 2, z1, BlockId.Glass);
  builder.fill(x1 - 1, 5, z1 - 1, x2 + 1, 5, z2 + 1, BlockId.Planks);
  builder.fill(x1, 6, z1, x2, 6, z2, BlockId.Planks);
  builder.fill(cx - 1, 7, z1, cx + 1, 7, z2, log);
}

function meetingWell(builder: StructureBuilder, log: BlockId): void {
  builder.supportedFloor(-2, -2, 2, 2, 0, BlockId.Cobblestone);
  builder.fill(-1, 0, -1, 1, 0, 1, BlockId.Water, 'always');
  for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as const) {
    builder.fill(x, 1, z, x, 4, z, log);
  }
  builder.fill(-2, 5, -2, 2, 5, 2, BlockId.Planks);
  builder.block(0, 6, 0, BlockId.Glass);
}

function pen(builder: StructureBuilder, log: BlockId): void {
  for (let x = -15; x <= -8; x++) {
    builder.terrainBlock(x, 12, 1, log);
    builder.terrainBlock(x, 16, 1, log);
  }
  for (let z = 13; z <= 15; z++) {
    builder.terrainBlock(-15, z, 1, log);
    if (z !== 14) builder.terrainBlock(-8, z, 1, log);
  }
  builder.linePath(-8, 14, -3, 3);
}

function garden(builder: StructureBuilder): void {
  for (let z = 11; z <= 15; z++) {
    for (let x = 8; x <= 14; x++) {
      builder.terrainPath(x, z, x === 11 ? BlockId.Water : BlockId.Dirt);
    }
  }
  builder.linePath(8, 13, 3, 3);
}

function settlerVillage(builder: StructureBuilder, rng: Rng): void {
  const log = villageLog(builder.placement.biome);
  meetingWell(builder, log);
  const sites = [
    [-10, -8],
    [9, -8],
    [-10, 8],
    [9, 8],
    [0, 12],
  ] as const;
  const count = 2 + Math.floor(rng() * 4);
  for (let i = 0; i < count; i++) {
    const [x, z] = sites[i];
    house(builder, x, z, log, rng() < 0.5 ? -1 : 1);
    builder.linePath(0, 3, x, z + 3, 2);
  }
  if (rng() < 0.75) pen(builder, log);
  if (rng() < 0.75) garden(builder);
  for (let x = -3; x <= 3; x++) {
    builder.terrainPath(x, 3);
    builder.terrainPath(0, x + 3);
  }
}

export const VILLAGE_STRUCTURE_FACTORIES: ReadonlyMap<StructureId, StructureFactory> = new Map([
  ['settler_village', settlerVillage],
]);
