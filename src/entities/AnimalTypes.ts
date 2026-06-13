import { BiomeId } from '../world/Biome';

export type AnimalKind = 'cow' | 'pig' | 'sheep' | 'chicken';
export type ClimateVariant = 'temperate' | 'warm' | 'cold';

export type SheepWoolColor =
  | 'white'
  | 'black'
  | 'gray'
  | 'light_gray'
  | 'brown'
  | 'pink';

export type PassiveMobState =
  | 'idle'
  | 'wandering'
  | 'looking'
  | 'swimming'
  | 'stuck'
  | 'panic';

export interface AnimalSpec {
  width: number;
  height: number;
  length: number;
  walkSpeed: number;
  groupMin: number;
  groupMax: number;
}

export const ANIMAL_SPECS: Record<AnimalKind, AnimalSpec> = {
  cow: {
    width: 0.9,
    height: 1.3,
    length: 1.4,
    walkSpeed: 1.2,
    groupMin: 2,
    groupMax: 4,
  },
  pig: {
    width: 0.9,
    height: 0.9,
    length: 1.1,
    walkSpeed: 1.3,
    groupMin: 2,
    groupMax: 4,
  },
  sheep: {
    width: 0.9,
    height: 1.1,
    length: 1.2,
    walkSpeed: 1.15,
    groupMin: 2,
    groupMax: 4,
  },
  chicken: {
    width: 0.4,
    height: 0.7,
    length: 0.4,
    walkSpeed: 0.95,
    groupMin: 2,
    groupMax: 5,
  },
};

const WARM_BIOMES = new Set<BiomeId>([
  BiomeId.Desert,
  BiomeId.Savanna,
  BiomeId.WarmOcean,
]);

const COLD_BIOMES = new Set<BiomeId>([
  BiomeId.Taiga,
  BiomeId.SnowyPlains,
  BiomeId.FrozenOcean,
]);

export function climateVariantFor(
  biome: BiomeId,
  effectiveTemperature?: number,
): ClimateVariant {
  if (effectiveTemperature !== undefined) {
    if (effectiveTemperature <= -0.2) return 'cold';
    if (effectiveTemperature >= 0.5) return 'warm';
  }
  if (COLD_BIOMES.has(biome)) return 'cold';
  if (WARM_BIOMES.has(biome)) return 'warm';
  return 'temperate';
}

const WOOL_WEIGHTS: Record<ClimateVariant, Array<[SheepWoolColor, number]>> = {
  temperate: [
    ['white', 0.78],
    ['black', 0.06],
    ['gray', 0.06],
    ['light_gray', 0.06],
    ['brown', 0.035],
    ['pink', 0.005],
  ],
  cold: [
    ['black', 0.32],
    ['gray', 0.2],
    ['light_gray', 0.18],
    ['white', 0.18],
    ['brown', 0.115],
    ['pink', 0.005],
  ],
  warm: [
    ['brown', 0.42],
    ['white', 0.3],
    ['black', 0.1],
    ['gray', 0.08],
    ['light_gray', 0.095],
    ['pink', 0.005],
  ],
};

/** Deterministic when `random` comes from the chunk/entity seeded RNG. */
export function selectSheepWoolColor(
  variant: ClimateVariant,
  random: number,
): SheepWoolColor {
  let cursor = Math.max(0, Math.min(0.999999, random));
  for (const [color, weight] of WOOL_WEIGHTS[variant]) {
    if (cursor < weight) return color;
    cursor -= weight;
  }
  return 'white';
}
