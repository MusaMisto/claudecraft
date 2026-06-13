import type { StructureId } from './Structure';
import { SMALL_STRUCTURE_FACTORIES } from './SmallStructures';
import type { StructureFactory } from './StructureGenerator';
import { TERRAIN_STRUCTURE_FACTORIES } from './TerrainStructures';
import { VILLAGE_STRUCTURE_FACTORIES } from './VillageStructures';

export const STRUCTURE_FACTORIES: ReadonlyMap<StructureId, StructureFactory> = new Map([
  ...SMALL_STRUCTURE_FACTORIES,
  ...VILLAGE_STRUCTURE_FACTORIES,
  ...TERRAIN_STRUCTURE_FACTORIES,
]);
