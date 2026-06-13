export enum BiomeId {
  Plains = 'plains',
  Forest = 'forest',
  BirchForest = 'birch_forest',
  Taiga = 'taiga',
  SnowyPlains = 'snowy_plains',
  Desert = 'desert',
  Savanna = 'savanna',
  Swamp = 'swamp',
  Ocean = 'ocean',
  WarmOcean = 'warm_ocean',
  FrozenOcean = 'frozen_ocean',
}

export type SurfaceKind = 'grass' | 'sand' | 'snow';
export type TreeKind = 'oak' | 'birch' | 'spruce' | 'acacia' | 'swamp_oak' | 'none';
export type FoliageProfile = 'plains' | 'forest' | 'birch' | 'taiga' | 'savanna' | 'swamp' | 'none';

export interface BiomeDef {
  id: BiomeId;
  name: string;
  temperature: number;
  downfall: number;
  waterColor: number;
  waterFogColor: number;
  waterFogDistance: number;
  grassTint: number;
  foliageTint: number;
  surface: SurfaceKind;
  tree: TreeKind;
  treeChance: number;
  foliage: FoliageProfile;
  ocean: boolean;
}

// Stable Java 26.1.2 biome JSON values. Most Overworld biomes inherit the
// default water/fog pair; only biome-specific overrides are listed by Mojang.
export const NORMAL_WATER = 0x3f76e4;
export const DEFAULT_WATER_FOG = 0x050533;
export const SWAMP_WATER = 0x617b64;
export const SWAMP_WATER_FOG = 0x232317;
export const WARM_OCEAN_WATER = 0x43d5ee;
export const WARM_OCEAN_FOG = 0x041f33;
export const FROZEN_OCEAN_WATER = 0x3938c9;

const biome = (
  id: BiomeId,
  name: string,
  temperature: number,
  downfall: number,
  options: Partial<BiomeDef> = {},
): BiomeDef => ({
  id,
  name,
  temperature,
  downfall,
  waterColor: NORMAL_WATER,
  waterFogColor: DEFAULT_WATER_FOG,
  waterFogDistance: 1,
  grassTint: 0xffffff,
  foliageTint: 0xffffff,
  surface: 'grass',
  tree: 'none',
  treeChance: 0,
  foliage: 'none',
  ocean: false,
  ...options,
});

export const BIOMES: Record<BiomeId, BiomeDef> = {
  [BiomeId.Plains]: biome(BiomeId.Plains, 'Plains', 0.8, 0.4, {
    tree: 'oak',
    treeChance: 1 / 90,
    foliage: 'plains',
  }),
  [BiomeId.Forest]: biome(BiomeId.Forest, 'Forest', 0.7, 0.8, {
    grassTint: 0xd4f0cc,
    foliageTint: 0xc5e7bd,
    tree: 'oak',
    treeChance: 1 / 24,
    foliage: 'forest',
  }),
  [BiomeId.BirchForest]: biome(BiomeId.BirchForest, 'Birch Forest', 0.6, 0.6, {
    grassTint: 0xe1f2c8,
    foliageTint: 0xd8edb8,
    tree: 'birch',
    treeChance: 1 / 27,
    foliage: 'birch',
  }),
  [BiomeId.Taiga]: biome(BiomeId.Taiga, 'Taiga', 0.25, 0.8, {
    grassTint: 0xb8d9c2,
    foliageTint: 0xa9cbb4,
    tree: 'spruce',
    treeChance: 1 / 26,
    foliage: 'taiga',
  }),
  [BiomeId.SnowyPlains]: biome(BiomeId.SnowyPlains, 'Snowy Plains', 0, 0.5, {
    grassTint: 0xdce9df,
    foliageTint: 0xc7d9cf,
    surface: 'snow',
    tree: 'spruce',
    treeChance: 1 / 75,
  }),
  [BiomeId.Desert]: biome(BiomeId.Desert, 'Desert', 2, 0, {
    surface: 'sand',
  }),
  [BiomeId.Savanna]: biome(BiomeId.Savanna, 'Savanna', 2, 0, {
    grassTint: 0xe3d39b,
    foliageTint: 0xd6ca8f,
    tree: 'acacia',
    treeChance: 1 / 48,
    foliage: 'savanna',
  }),
  [BiomeId.Swamp]: biome(BiomeId.Swamp, 'Swamp', 0.8, 0.9, {
    waterColor: SWAMP_WATER,
    waterFogColor: SWAMP_WATER_FOG,
    waterFogDistance: 0.85,
    grassTint: 0xa1ad78,
    foliageTint: 0x929c68,
    tree: 'swamp_oak',
    treeChance: 1 / 32,
    foliage: 'swamp',
  }),
  [BiomeId.Ocean]: biome(BiomeId.Ocean, 'Ocean', 0.5, 0.5, {
    surface: 'sand',
    ocean: true,
  }),
  [BiomeId.WarmOcean]: biome(BiomeId.WarmOcean, 'Warm Ocean', 0.5, 0.5, {
    waterColor: WARM_OCEAN_WATER,
    waterFogColor: WARM_OCEAN_FOG,
    surface: 'sand',
    ocean: true,
  }),
  [BiomeId.FrozenOcean]: biome(BiomeId.FrozenOcean, 'Frozen Ocean', 0, 0.5, {
    waterColor: FROZEN_OCEAN_WATER,
    surface: 'sand',
    ocean: true,
  }),
};

export function biomeDef(id: BiomeId): BiomeDef {
  return BIOMES[id];
}
