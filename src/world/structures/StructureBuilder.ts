import { BlockId } from '../Block';
import type { StructureTerrain } from './StructurePlacement';
import type {
  ReplaceRule,
  StructureBlock,
  StructurePlacement,
} from './Structure';

function rotate(x: number, z: number, rotation: StructurePlacement['rotation']): [number, number] {
  if (rotation === 90) return [-z, x];
  if (rotation === 180) return [-x, -z];
  if (rotation === 270) return [z, -x];
  return [x, z];
}

export class StructureBuilder {
  private readonly blocks = new Map<string, StructureBlock>();

  constructor(
    readonly placement: StructurePlacement,
    private readonly terrain: StructureTerrain,
  ) {}

  block(
    x: number,
    y: number,
    z: number,
    block: BlockId,
    replaceRule: ReplaceRule = 'never_water',
    loreId?: string,
  ): void {
    const [rx, rz] = rotate(x, z, this.placement.rotation);
    const worldBlock: StructureBlock = {
      x: this.placement.originX + rx,
      y: this.placement.originY + y,
      z: this.placement.originZ + rz,
      block,
      replaceRule,
      loreId,
    };
    this.blocks.set(`${worldBlock.x},${worldBlock.y},${worldBlock.z}`, worldBlock);
  }

  fill(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    block: BlockId,
    replaceRule: ReplaceRule = 'never_water',
  ): void {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
          this.block(x, y, z, block, replaceRule);
        }
      }
    }
  }

  hollowBox(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    block: BlockId,
  ): void {
    for (let y = y1; y <= y2; y++) {
      for (let z = z1; z <= z2; z++) {
        for (let x = x1; x <= x2; x++) {
          const edge = x === x1 || x === x2 || y === y1 || y === y2 || z === z1 || z === z2;
          if (edge) this.block(x, y, z, block);
          else this.block(x, y, z, BlockId.Air, 'clear');
        }
      }
    }
  }

  clear(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): void {
    this.fill(x1, y1, z1, x2, y2, z2, BlockId.Air, 'clear');
  }

  support(x: number, z: number, floorY: number, block: BlockId, maxDepth = 10): void {
    const [rx, rz] = rotate(x, z, this.placement.rotation);
    const wx = this.placement.originX + rx;
    const wz = this.placement.originZ + rz;
    const floor = this.placement.originY + floorY;
    const surface = this.terrain.height(wx, wz);
    const bottom = Math.max(surface + 1, floor - maxDepth);
    for (let y = bottom; y < floor; y++) {
      const localY = y - this.placement.originY;
      this.block(x, localY, z, block, 'foundation');
    }
  }

  supportedFloor(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    y: number,
    floor: BlockId,
    foundation = BlockId.Cobblestone,
  ): void {
    for (let z = z1; z <= z2; z++) {
      for (let x = x1; x <= x2; x++) {
        this.support(x, z, y, foundation);
        this.block(x, y, z, floor);
      }
    }
  }

  terrainPath(x: number, z: number, block = BlockId.Gravel): void {
    const [rx, rz] = rotate(x, z, this.placement.rotation);
    const wx = this.placement.originX + rx;
    const wz = this.placement.originZ + rz;
    const worldY = this.terrain.height(wx, wz);
    this.block(x, worldY - this.placement.originY, z, block, 'path');
    this.block(x, worldY + 1 - this.placement.originY, z, BlockId.Air, 'air_or_vegetation');
  }

  terrainBlock(
    x: number,
    z: number,
    aboveSurface: number,
    block: BlockId,
    replaceRule: ReplaceRule = 'never_water',
  ): void {
    const [rx, rz] = rotate(x, z, this.placement.rotation);
    const wx = this.placement.originX + rx;
    const wz = this.placement.originZ + rz;
    const worldY = this.terrain.height(wx, wz) + aboveSurface;
    this.block(x, worldY - this.placement.originY, z, block, replaceRule);
  }

  linePath(x1: number, z1: number, x2: number, z2: number, width = 1): void {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(z2 - z1));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x1 + ((x2 - x1) * i) / Math.max(1, steps));
      const z = Math.round(z1 + ((z2 - z1) * i) / Math.max(1, steps));
      for (let offset = -Math.floor(width / 2); offset <= Math.floor(width / 2); offset++) {
        if (Math.abs(x2 - x1) >= Math.abs(z2 - z1)) this.terrainPath(x, z + offset);
        else this.terrainPath(x + offset, z);
      }
    }
  }

  result(): StructureBlock[] {
    return [...this.blocks.values()];
  }
}
