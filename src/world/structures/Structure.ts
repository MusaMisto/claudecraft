import type { BiomeId } from '../Biome';
import type { BlockId } from '../Block';

export type StructureId =
  | 'stone_cairn'
  | 'small_ruin'
  | 'forest_waystone'
  | 'settler_village'
  | 'desert_sun_temple'
  | 'mountain_watchtower'
  | 'coastal_ruins'
  | 'cloudwright_obelisk'
  | 'buried_archive'
  | 'ancient_gate';

export type StructureSize = 'micro' | 'small' | 'medium' | 'large';
export type StructureRotation = 0 | 90 | 180 | 270;

export interface StructureAabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface StructurePlacement {
  id: StructureId;
  originX: number;
  originY: number;
  originZ: number;
  rotation: StructureRotation;
  seed: number;
  boundingBox: StructureAabb;
  biome: BiomeId;
  regionX: number;
  regionZ: number;
}

export type ReplaceRule =
  | 'always'
  | 'air_or_vegetation'
  | 'natural'
  | 'foundation'
  | 'path'
  | 'never_water'
  | 'clear';

export interface StructureBlock {
  x: number;
  y: number;
  z: number;
  block: BlockId;
  replaceRule: ReplaceRule;
  loreId?: string;
}

export function aabbIntersects(a: StructureAabb, b: StructureAabb, padding = 0): boolean {
  return (
    a.minX - padding <= b.maxX &&
    a.maxX + padding >= b.minX &&
    a.minY <= b.maxY &&
    a.maxY >= b.minY &&
    a.minZ - padding <= b.maxZ &&
    a.maxZ + padding >= b.minZ
  );
}

export function distanceToAabb2D(x: number, z: number, box: StructureAabb): number {
  const dx = Math.max(box.minX - x, 0, x - box.maxX);
  const dz = Math.max(box.minZ - z, 0, z - box.maxZ);
  return Math.hypot(dx, dz);
}
