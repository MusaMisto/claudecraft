import type { Rng } from '../../core/Rng';
import { BlockId } from '../Block';
import type { StructureId } from './Structure';
import type { StructureBuilder } from './StructureBuilder';
import type { StructureFactory } from './StructureGenerator';

function desertSunTemple(builder: StructureBuilder): void {
  builder.supportedFloor(-7, -7, 7, 7, 0, BlockId.Sand, BlockId.Stone);
  builder.hollowBox(-4, 1, -4, 4, 6, 4, BlockId.Stone);
  builder.clear(-2, 1, 4, 2, 3, 4);
  builder.fill(-5, -5, -5, 5, -1, 5, BlockId.Stone);
  builder.clear(-4, -4, -4, 4, -2, 4);
  builder.clear(-1, -1, -1, 1, 1, 1);

  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]] as const) {
    builder.fill(x, 1, z, x, 7, z, BlockId.Cobblestone);
    builder.block(x, 8, z, BlockId.Glass);
  }
  for (let d = -3; d <= 3; d++) {
    builder.block(d, 0, 0, BlockId.Cobblestone);
    builder.block(0, 0, d, BlockId.Cobblestone);
  }
  builder.block(0, 0, 0, BlockId.Glass);
  builder.fill(-3, 7, -3, 3, 7, 3, BlockId.Sand);
  builder.fill(-1, 8, -1, 1, 8, 1, BlockId.Glass);
  builder.block(0, -4, 0, BlockId.EtchedStone);

  // Full-block stepped descent to the archive chamber.
  for (let i = 0; i < 4; i++) {
    builder.block(0, -1 - i, 2 - i, BlockId.Cobblestone);
    builder.clear(-1, -i, 2 - i, 1, 2 - i, 2 - i);
  }
}

function mountainWatchtower(builder: StructureBuilder): void {
  builder.supportedFloor(-3, -3, 3, 3, 0, BlockId.Cobblestone, BlockId.Stone);
  builder.hollowBox(-3, 1, -3, 3, 14, 3, BlockId.Cobblestone);
  builder.clear(-1, 1, 3, 1, 3, 3);
  for (const y of [5, 9, 12]) {
    builder.block(0, y, -3, BlockId.Air, 'clear');
    builder.block(-3, y, 0, BlockId.Air, 'clear');
    builder.block(3, y, 0, BlockId.Air, 'clear');
  }
  for (let y = 2; y <= 12; y += 2) {
    builder.block(y % 4 === 0 ? -1 : 1, y, -2, BlockId.Planks);
  }
  builder.fill(-5, 15, -5, 5, 15, 5, BlockId.Planks);
  for (let i = -5; i <= 5; i++) {
    builder.block(i, 16, -5, BlockId.Log);
    builder.block(i, 16, 5, BlockId.Log);
    builder.block(-5, 16, i, BlockId.Log);
    builder.block(5, 16, i, BlockId.Log);
  }
  for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]] as const) {
    builder.fill(x, 16, z, x, 19, z, BlockId.Log);
  }
  builder.fill(-4, 20, -4, 4, 20, 4, BlockId.Planks);
  builder.block(0, 13, 0, BlockId.EtchedStone);
}

function coastalRuins(builder: StructureBuilder, rng: Rng): void {
  builder.supportedFloor(-6, -3, 6, 3, 0, BlockId.Cobblestone);
  builder.clear(-5, 1, -2, 5, 5, 2);
  for (let x = -6; x <= 6; x++) {
    for (const z of [-3, 3]) {
      const height = 1 + Math.floor(rng() * 5);
      for (let y = 1; y <= height; y++) {
        if (rng() > 0.3) builder.block(x, y, z, BlockId.Cobblestone);
      }
    }
  }
  for (const x of [-6, 6]) {
    for (let z = -2; z <= 2; z++) {
      const height = 1 + Math.floor(rng() * 4);
      for (let y = 1; y <= height; y++) {
        if (rng() > 0.35) builder.block(x, y, z, BlockId.Stone);
      }
    }
  }

  // Local +Z faces the nearest low/water cardinal sampled by the planner.
  for (let z = 4; z <= 10; z++) {
    builder.fill(-1, 0, z, 1, 0, z, BlockId.Planks, 'always');
    if (z % 3 === 1) {
      for (const x of [-1, 1]) builder.fill(x, -4, z, x, -1, z, BlockId.Log, 'always');
    }
  }
  builder.block(-3, -1, 5, BlockId.Cobblestone, 'always');
  builder.block(3, -1, 7, BlockId.Cobblestone, 'always');
  builder.block(0, -1, 10, BlockId.Stone, 'always');
  builder.block(0, 1, -2, BlockId.EtchedStone);
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(rng() * 15) - 7;
    const z = Math.floor(rng() * 13) - 4;
    builder.terrainBlock(x, z, 1, BlockId.Cobblestone, 'natural');
  }
}

export const TERRAIN_STRUCTURE_FACTORIES: ReadonlyMap<StructureId, StructureFactory> = new Map([
  ['desert_sun_temple', desertSunTemple],
  ['mountain_watchtower', mountainWatchtower],
  ['coastal_ruins', coastalRuins],
]);
