import type { TileName } from '../rendering/TextureAtlas';

export type FoliageKind =
  | 'short_grass'
  | 'tall_grass'
  | 'fern'
  | 'bush'
  | 'dandelion'
  | 'poppy'
  | 'cornflower'
  | 'oxeye_daisy'
  | 'wildflowers'
  | 'dry_grass'
  | 'dead_bush';

export interface FoliageSpec {
  tile: TileName;
  width: number;
  height: number;
}

export const FOLIAGE_KINDS: FoliageKind[] = [
  'short_grass',
  'tall_grass',
  'fern',
  'bush',
  'dandelion',
  'poppy',
  'cornflower',
  'oxeye_daisy',
  'wildflowers',
  'dry_grass',
  'dead_bush',
];

export const FOLIAGE_SPECS: Record<FoliageKind, FoliageSpec> = {
  short_grass: { tile: 'short_grass', width: 0.86, height: 0.78 },
  tall_grass: { tile: 'tall_grass', width: 0.92, height: 1.72 },
  fern: { tile: 'fern', width: 0.92, height: 0.92 },
  bush: { tile: 'bush', width: 1.0, height: 0.88 },
  dandelion: { tile: 'dandelion', width: 0.78, height: 0.82 },
  poppy: { tile: 'poppy', width: 0.78, height: 0.84 },
  cornflower: { tile: 'cornflower', width: 0.78, height: 0.84 },
  oxeye_daisy: { tile: 'oxeye_daisy', width: 0.82, height: 0.86 },
  wildflowers: { tile: 'wildflowers', width: 0.98, height: 0.72 },
  dry_grass: { tile: 'dry_grass', width: 0.9, height: 0.88 },
  dead_bush: { tile: 'dead_bush', width: 0.9, height: 0.82 },
};

/** Grass dominates; each flower remains a sparse accent. */
export function selectFoliage(variant: number): FoliageKind {
  if (variant < 0.48) return 'short_grass';
  if (variant < 0.68) return 'tall_grass';
  if (variant < 0.78) return 'fern';
  if (variant < 0.84) return 'bush';
  if (variant < 0.88) return 'dandelion';
  if (variant < 0.91) return 'poppy';
  if (variant < 0.94) return 'cornflower';
  if (variant < 0.97) return 'oxeye_daisy';
  return 'wildflowers';
}
