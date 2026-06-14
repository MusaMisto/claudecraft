import { hashSeed } from '../../core/Rng';

export const LORE_FRAGMENTS = [
  'The sky was measured here.',
  'Four stones. One current.',
  'They built upward, then vanished.',
  'The wells remember rain.',
  'Where clouds gather, the old roads turn.',
  'Not all ruins fell. Some were abandoned.',
  'The Cloudwrights marked the warm winds.',
  'The gate waits without a key.',
] as const;

export function loreFragmentAt(x: number, y: number, z: number): string {
  const index = hashSeed(`cloudwright-lore:${x},${y},${z}`) % LORE_FRAGMENTS.length;
  return LORE_FRAGMENTS[index];
}
