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
}

export type SoundMaterial = 'grass' | 'stone' | 'sand' | 'wood' | 'glass' | 'none';

export interface BlockDef {
  id: BlockId;
  name: string;
  /** Blocks player movement / supports placement targeting. */
  solid: boolean;
  /** Rendered in the transparent pass; neighbors draw faces against it. */
  transparent: boolean;
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
