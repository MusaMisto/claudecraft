import { BiomeId } from '../Biome';
import type { StructureId, StructureSize } from './Structure';

export type StructureWaterRule = 'dry' | 'coastal' | 'any';

export interface StructureDefinition {
  id: StructureId;
  displayName: string;
  size: StructureSize;
  regionChunks: number;
  chance: number;
  attempts: number;
  radius: number;
  below: number;
  above: number;
  maxSlope: number;
  minElevation: number;
  maxElevation: number;
  minSpawnChunks: number;
  waterRule: StructureWaterRule;
  allowedBiomes: readonly BiomeId[] | 'land';
}

const LAND_SETTLEMENTS = [
  BiomeId.Plains,
  BiomeId.Forest,
  BiomeId.BirchForest,
  BiomeId.Taiga,
  BiomeId.Savanna,
] as const;

export const STRUCTURE_REGISTRY: readonly StructureDefinition[] = [
  {
    id: 'stone_cairn', displayName: 'Stone Cairn', size: 'micro',
    regionChunks: 4, chance: 0.72, attempts: 4, radius: 2, below: 1, above: 5,
    maxSlope: 3, minElevation: 63, maxElevation: 112, minSpawnChunks: 0,
    waterRule: 'dry', allowedBiomes: 'land',
  },
  {
    id: 'small_ruin', displayName: 'Small Ruin', size: 'small',
    regionChunks: 7, chance: 0.5, attempts: 5, radius: 5, below: 2, above: 8,
    maxSlope: 6, minElevation: 63, maxElevation: 112, minSpawnChunks: 1,
    waterRule: 'dry', allowedBiomes: 'land',
  },
  {
    id: 'forest_waystone', displayName: 'Forest Waystone Shrine', size: 'small',
    regionChunks: 8, chance: 0.7, attempts: 7, radius: 4, below: 2, above: 9,
    maxSlope: 5, minElevation: 63, maxElevation: 112, minSpawnChunks: 1,
    waterRule: 'dry', allowedBiomes: [BiomeId.Forest, BiomeId.BirchForest, BiomeId.Taiga],
  },
  {
    id: 'cloudwright_obelisk', displayName: 'Cloudwright Obelisk', size: 'small',
    regionChunks: 10, chance: 0.68, attempts: 6, radius: 4, below: 2, above: 15,
    maxSlope: 5, minElevation: 65, maxElevation: 116, minSpawnChunks: 2,
    waterRule: 'dry', allowedBiomes: 'land',
  },
  {
    id: 'settler_village', displayName: 'Settler Village', size: 'medium',
    regionChunks: 14, chance: 0.72, attempts: 9, radius: 17, below: 3, above: 12,
    maxSlope: 4, minElevation: 64, maxElevation: 102, minSpawnChunks: 4,
    waterRule: 'dry', allowedBiomes: LAND_SETTLEMENTS,
  },
  {
    id: 'desert_sun_temple', displayName: 'Desert Sun Temple', size: 'medium',
    regionChunks: 14, chance: 0.72, attempts: 9, radius: 10, below: 6, above: 12,
    maxSlope: 5, minElevation: 63, maxElevation: 105, minSpawnChunks: 4,
    waterRule: 'dry', allowedBiomes: [BiomeId.Desert, BiomeId.Savanna],
  },
  {
    id: 'mountain_watchtower', displayName: 'Mountain Watchtower', size: 'medium',
    regionChunks: 12, chance: 0.82, attempts: 10, radius: 6, below: 4, above: 24,
    maxSlope: 9, minElevation: 82, maxElevation: 116, minSpawnChunks: 4,
    waterRule: 'dry', allowedBiomes: 'land',
  },
  {
    id: 'coastal_ruins', displayName: 'Coastal Ruins', size: 'medium',
    regionChunks: 12, chance: 0.8, attempts: 10, radius: 10, below: 3, above: 9,
    maxSlope: 6, minElevation: 61, maxElevation: 68, minSpawnChunks: 3,
    waterRule: 'coastal', allowedBiomes: 'land',
  },
  {
    id: 'buried_archive', displayName: 'Buried Archive', size: 'medium',
    regionChunks: 18, chance: 0.48, attempts: 8, radius: 7, below: 9, above: 7,
    maxSlope: 5, minElevation: 65, maxElevation: 106, minSpawnChunks: 8,
    waterRule: 'dry', allowedBiomes: [BiomeId.Plains, BiomeId.Forest, BiomeId.Desert],
  },
  {
    id: 'ancient_gate', displayName: 'Ancient Gate', size: 'large',
    regionChunks: 28, chance: 0.58, attempts: 10, radius: 13, below: 3, above: 20,
    maxSlope: 5, minElevation: 66, maxElevation: 108, minSpawnChunks: 12,
    waterRule: 'dry', allowedBiomes: [BiomeId.Plains, BiomeId.Savanna, BiomeId.Desert, BiomeId.SnowyPlains],
  },
];

export const STRUCTURE_BY_ID = new Map(STRUCTURE_REGISTRY.map((definition) => [definition.id, definition]));
export const MAX_STRUCTURE_RADIUS = Math.max(...STRUCTURE_REGISTRY.map((definition) => definition.radius));
