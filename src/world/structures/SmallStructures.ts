import { BlockId } from '../Block';
import type { Rng } from '../../core/Rng';
import type { StructureBuilder } from './StructureBuilder';
import type { StructureFactory } from './StructureGenerator';
import type { StructureId } from './Structure';

function stoneCairn(builder: StructureBuilder): void {
  for (const [x, z] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    builder.support(x, z, 0, BlockId.Cobblestone, 5);
    builder.block(x, 0, z, BlockId.Cobblestone);
  }
  builder.block(0, 1, 0, BlockId.Stone);
  builder.block(0, 2, 0, BlockId.Cobblestone);
}

function smallRuin(builder: StructureBuilder, rng: Rng): void {
  builder.supportedFloor(-3, -2, 3, 2, 0, BlockId.Cobblestone);
  builder.clear(-2, 1, -1, 2, 4, 1);
  for (let x = -3; x <= 3; x++) {
    for (const z of [-2, 2]) {
      const height = 1 + Math.floor(rng() * 4);
      for (let y = 1; y <= height; y++) {
        if (rng() > 0.22 || y === 1) builder.block(x, y, z, BlockId.Cobblestone);
      }
    }
  }
  for (let z = -1; z <= 1; z++) {
    for (const x of [-3, 3]) {
      const height = 1 + Math.floor(rng() * 3);
      for (let y = 1; y <= height; y++) {
        if (rng() > 0.28) builder.block(x, y, z, rng() < 0.3 ? BlockId.Stone : BlockId.Cobblestone);
      }
    }
  }
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rng() * 9) - 4;
    const z = Math.floor(rng() * 7) - 3;
    if (Math.abs(x) <= 3 && Math.abs(z) <= 2) continue;
    builder.block(x, -1, z, BlockId.Cobblestone, 'natural');
  }
}

function forestWaystone(builder: StructureBuilder): void {
  builder.supportedFloor(-2, -1, 2, 1, 0, BlockId.Cobblestone);
  builder.clear(-1, 1, -1, 1, 4, 1);
  for (const x of [-2, 2]) {
    builder.block(x, 1, 0, BlockId.Log);
    builder.block(x, 2, 0, BlockId.Log);
    builder.block(x, 3, 0, BlockId.Log);
    builder.block(x, 4, 0, BlockId.Planks);
  }
  builder.fill(-1, 4, 0, 1, 4, 0, BlockId.Planks);
  builder.block(0, 1, 0, BlockId.Stone);
  builder.block(0, 2, 0, BlockId.Cobblestone);
  for (const x of [-3, 3]) {
    for (let y = 1; y <= 3; y++) builder.block(x, y, 0, BlockId.Leaves, 'air_or_vegetation');
  }
  builder.block(-2, 4, -1, BlockId.Leaves, 'air_or_vegetation');
  builder.block(2, 4, 1, BlockId.Leaves, 'air_or_vegetation');
  builder.linePath(0, 2, 0, 5);
}

export const SMALL_STRUCTURE_FACTORIES: ReadonlyMap<StructureId, StructureFactory> = new Map([
  ['stone_cairn', stoneCairn],
  ['small_ruin', smallRuin],
  ['forest_waystone', forestWaystone],
]);
