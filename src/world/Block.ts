// BlockId enum + registry: per-face texture tiles, solidity, transparency,
// and footstep/interaction sound material.
import type { TileName } from '../rendering/TextureAtlas';

export enum BlockId {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Cobblestone = 4,
  Planks = 5,
  Log = 6,
  Leaves = 7,
  Sand = 8,
  Glass = 9,
  Water = 10,
  Snow = 11,
  Ice = 12,
  Cactus = 13,
  BirchLog = 14,
  BirchLeaves = 15,
  SpruceLog = 16,
  SpruceLeaves = 17,
  AcaciaLog = 18,
  AcaciaLeaves = 19,
}

export type SoundMaterial = 'grass' | 'stone' | 'sand' | 'wood' | 'glass' | 'none';

export interface BlockDef {
  id: BlockId;
  name: string;
  /** Blocks player movement / supports placement targeting. */
  solid: boolean;
  /** Rendered in the transparent pass; neighbors draw faces against it. */
  transparent: boolean;
  /** Biome-tinted alpha-cutout leaf family. */
  leafy?: boolean;
  faces: { top: TileName; bottom: TileName; side: TileName };
  sound: SoundMaterial;
}

const defs = new Map<BlockId, BlockDef>();

function register(def: BlockDef): void {
  defs.set(def.id, def);
}

register({
  id: BlockId.Grass,
  name: 'Grass',
  solid: true,
  transparent: false,
  faces: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' },
  sound: 'grass',
});
register({
  id: BlockId.Dirt,
  name: 'Dirt',
  solid: true,
  transparent: false,
  faces: { top: 'dirt', bottom: 'dirt', side: 'dirt' },
  sound: 'grass',
});
register({
  id: BlockId.Stone,
  name: 'Stone',
  solid: true,
  transparent: false,
  faces: { top: 'stone', bottom: 'stone', side: 'stone' },
  sound: 'stone',
});
register({
  id: BlockId.Cobblestone,
  name: 'Cobblestone',
  solid: true,
  transparent: false,
  faces: { top: 'cobblestone', bottom: 'cobblestone', side: 'cobblestone' },
  sound: 'stone',
});
register({
  id: BlockId.Planks,
  name: 'Oak Planks',
  solid: true,
  transparent: false,
  faces: { top: 'planks', bottom: 'planks', side: 'planks' },
  sound: 'wood',
});
register({
  id: BlockId.Log,
  name: 'Oak Log',
  solid: true,
  transparent: false,
  faces: { top: 'log_top', bottom: 'log_top', side: 'log_side' },
  sound: 'wood',
});
register({
  id: BlockId.Leaves,
  name: 'Leaves',
  solid: true,
  transparent: true,
  leafy: true,
  faces: { top: 'leaves', bottom: 'leaves', side: 'leaves' },
  sound: 'grass',
});
register({
  id: BlockId.Sand,
  name: 'Sand',
  solid: true,
  transparent: false,
  faces: { top: 'sand', bottom: 'sand', side: 'sand' },
  sound: 'sand',
});
register({
  id: BlockId.Glass,
  name: 'Glass',
  solid: true,
  transparent: true,
  faces: { top: 'glass', bottom: 'glass', side: 'glass' },
  sound: 'glass',
});
register({
  id: BlockId.Water,
  name: 'Water',
  solid: false,
  transparent: true,
  faces: { top: 'water', bottom: 'water', side: 'water' },
  sound: 'none',
});
register({
  id: BlockId.Snow,
  name: 'Snow',
  solid: true,
  transparent: false,
  faces: { top: 'snow', bottom: 'snow', side: 'snow' },
  sound: 'sand',
});
register({
  id: BlockId.Ice,
  name: 'Ice',
  solid: true,
  transparent: true,
  faces: { top: 'ice', bottom: 'ice', side: 'ice' },
  sound: 'glass',
});
register({
  id: BlockId.Cactus,
  name: 'Cactus',
  solid: true,
  transparent: false,
  faces: { top: 'cactus_top', bottom: 'cactus_top', side: 'cactus_side' },
  sound: 'grass',
});
register({
  id: BlockId.BirchLog,
  name: 'Birch Log',
  solid: true,
  transparent: false,
  faces: { top: 'birch_log_top', bottom: 'birch_log_top', side: 'birch_log_side' },
  sound: 'wood',
});
register({
  id: BlockId.BirchLeaves,
  name: 'Birch Leaves',
  solid: true,
  transparent: true,
  leafy: true,
  faces: { top: 'birch_leaves', bottom: 'birch_leaves', side: 'birch_leaves' },
  sound: 'grass',
});
register({
  id: BlockId.SpruceLog,
  name: 'Spruce Log',
  solid: true,
  transparent: false,
  faces: { top: 'spruce_log_top', bottom: 'spruce_log_top', side: 'spruce_log_side' },
  sound: 'wood',
});
register({
  id: BlockId.SpruceLeaves,
  name: 'Spruce Leaves',
  solid: true,
  transparent: true,
  leafy: true,
  faces: { top: 'spruce_leaves', bottom: 'spruce_leaves', side: 'spruce_leaves' },
  sound: 'grass',
});
register({
  id: BlockId.AcaciaLog,
  name: 'Acacia Log',
  solid: true,
  transparent: false,
  faces: { top: 'acacia_log_top', bottom: 'acacia_log_top', side: 'acacia_log_side' },
  sound: 'wood',
});
register({
  id: BlockId.AcaciaLeaves,
  name: 'Acacia Leaves',
  solid: true,
  transparent: true,
  leafy: true,
  faces: { top: 'acacia_leaves', bottom: 'acacia_leaves', side: 'acacia_leaves' },
  sound: 'grass',
});

export function blockDef(id: BlockId): BlockDef | undefined {
  return defs.get(id);
}

export function isSolid(id: BlockId): boolean {
  return defs.get(id)?.solid ?? false;
}

/** True if a face of a neighboring block should be drawn against this block. */
export function isTransparent(id: BlockId): boolean {
  if (id === BlockId.Air) return true;
  return defs.get(id)?.transparent ?? false;
}

export function isLeafBlock(id: BlockId): boolean {
  return defs.get(id)?.leafy ?? false;
}

/** Hotbar contents, slots 1–9 (fixed). */
export const HOTBAR_BLOCKS: BlockId[] = [
  BlockId.Grass,
  BlockId.Dirt,
  BlockId.Stone,
  BlockId.Cobblestone,
  BlockId.Planks,
  BlockId.Log,
  BlockId.Leaves,
  BlockId.Sand,
  BlockId.Glass,
];
