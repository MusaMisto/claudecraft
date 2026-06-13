import type { Rng } from '../../core/Rng';
import { BlockId } from '../Block';
import type { StructureId } from './Structure';
import type { StructureBuilder } from './StructureBuilder';
import type { StructureFactory } from './StructureGenerator';

function cloudwrightObelisk(builder: StructureBuilder): void {
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]] as const) {
    builder.support(x, z, 0, BlockId.Cobblestone);
    builder.block(x, 0, z, BlockId.Cobblestone);
    builder.block(x, 1, z, BlockId.Stone);
  }
  builder.supportedFloor(-1, -1, 1, 1, 0, BlockId.Stone);
  for (let y = 1; y <= 10; y++) {
    builder.block(0, y, 0, y % 3 === 0 ? BlockId.Cobblestone : BlockId.Stone);
  }
  builder.fill(-1, 7, 0, 1, 7, 0, BlockId.Glass);
  builder.fill(0, 7, -1, 0, 7, 1, BlockId.Glass);
  builder.block(0, 11, 0, BlockId.Glass);
  builder.linePath(0, 2, 0, 6);
}

function buriedArchive(builder: StructureBuilder): void {
  builder.hollowBox(-5, -8, -5, 5, -3, 5, BlockId.Stone);
  builder.clear(-4, -7, -4, 4, -4, 4);
  for (let x = -3; x <= 3; x += 2) {
    builder.fill(x, -7, -4, x, -4, -4, BlockId.Cobblestone);
    builder.fill(x, -7, 4, x, -4, 4, BlockId.Cobblestone);
  }
  builder.fill(-1, -8, -1, 1, -8, 1, BlockId.Glass);
  builder.block(0, -7, 0, BlockId.Cobblestone);

  // A narrow, full-block staircase keeps the chamber hidden but discoverable.
  for (let i = 0; i <= 6; i++) {
    const z = 6 - i;
    const y = -i;
    builder.fill(-1, y, z, 1, y, z, BlockId.Cobblestone);
    builder.clear(-1, y + 1, z, 1, y + 3, z);
  }
  builder.supportedFloor(-2, -2, 2, 2, 0, BlockId.Cobblestone);
  builder.fill(-1, 1, 0, 1, 3, 0, BlockId.Stone);
  builder.block(0, 2, 0, BlockId.Glass);
  builder.linePath(0, 2, 0, 7);
}

function ancientGate(builder: StructureBuilder, rng: Rng): void {
  for (const x of [-7, 7]) {
    for (let z = -2; z <= 2; z++) {
      builder.support(x, z, 0, BlockId.Stone, 12);
      builder.block(x, 0, z, BlockId.Cobblestone);
    }
    for (let y = 1; y <= 14; y++) {
      const width = y < 4 ? 2 : y < 10 ? 1 : 0;
      for (let dx = -width; dx <= width; dx++) {
        builder.block(x + dx, y, 0, y % 4 === 0 ? BlockId.Cobblestone : BlockId.Stone);
      }
    }
  }

  // Broken arch shoulders imply a once-complete ring without closing it.
  for (let i = 0; i <= 5; i++) {
    builder.block(-7 + i, 14 + Math.floor(i / 2), 0, BlockId.Stone);
    if (i < 4) builder.block(7 - i, 14 + Math.floor(i / 2), 0, BlockId.Cobblestone);
  }
  builder.block(-1, 17, 0, BlockId.Glass);
  builder.block(0, 18, 0, BlockId.Glass);

  for (const [x, z] of [[-11, -4], [11, -4], [-11, 4], [11, 4]] as const) {
    builder.support(x, z, 0, BlockId.Cobblestone);
    builder.fill(x, 0, z, x, 2, z, BlockId.Cobblestone);
  }
  builder.linePath(0, -12, 0, 12, 2);
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(rng() * 23) - 11;
    const z = Math.floor(rng() * 13) - 6;
    if (Math.abs(x) < 4 && Math.abs(z) < 2) continue;
    builder.terrainBlock(x, z, 1, rng() < 0.35 ? BlockId.Stone : BlockId.Cobblestone);
  }
}

export const CLOUDWRIGHT_STRUCTURE_FACTORIES: ReadonlyMap<StructureId, StructureFactory> = new Map([
  ['cloudwright_obelisk', cloudwrightObelisk],
  ['buried_archive', buriedArchive],
  ['ancient_gate', ancientGate],
]);
