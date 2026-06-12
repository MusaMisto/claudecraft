// Block targeting (Amanatides & Woo voxel DDA), highlight box, break/place.
import * as THREE from 'three';
import { BlockId, isSolid } from '../world/Block';
import type { World } from '../world/World';
import { Player, PLAYER_HALF_WIDTH, PLAYER_HEIGHT } from './Player';

export const REACH = 5; // blocks (creative)

export interface BlockHit {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

/** DDA traversal from `origin` along `dir` (normalized), up to REACH blocks. */
export function raycastBlocks(world: World, origin: THREE.Vector3, dir: THREE.Vector3): BlockHit | null {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = dir.x > 0 ? 1 : -1;
  const stepY = dir.y > 0 ? 1 : -1;
  const stepZ = dir.z > 0 ? 1 : -1;

  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

  const frac = (v: number) => v - Math.floor(v);
  let tMaxX = dir.x !== 0 ? (dir.x > 0 ? (1 - frac(origin.x)) * tDeltaX : frac(origin.x) * tDeltaX) : Infinity;
  let tMaxY = dir.y !== 0 ? (dir.y > 0 ? (1 - frac(origin.y)) * tDeltaY : frac(origin.y) * tDeltaY) : Infinity;
  let tMaxZ = dir.z !== 0 ? (dir.z > 0 ? (1 - frac(origin.z)) * tDeltaZ : frac(origin.z) * tDeltaZ) : Infinity;

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;

  while (t <= REACH) {
    if (isSolid(world.getBlock(x, y, z))) {
      return { x, y, z, nx, ny, nz };
    }
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      t = tMaxX;
      tMaxX += tDeltaX;
      x += stepX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY <= tMaxZ) {
      t = tMaxY;
      tMaxY += tDeltaY;
      y += stepY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      z += stepZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
  }
  return null;
}

export class BlockInteraction {
  /** Thin black wireframe drawn around the targeted block. */
  readonly highlight: THREE.LineSegments;
  target: BlockHit | null = null;

  private origin = new THREE.Vector3();
  private dir = new THREE.Vector3();

  constructor(
    private world: World,
    private player: Player,
  ) {
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    this.highlight = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
    this.highlight.visible = false;
  }

  /** Recompute the targeted block from the player's eye ray. */
  updateTarget(): void {
    const p = this.player;
    this.origin.set(p.position.x, p.position.y + p.eyeHeight, p.position.z);
    const cp = Math.cos(p.pitch);
    this.dir.set(-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp).normalize();
    this.target = raycastBlocks(this.world, this.origin, this.dir);
    if (this.target) {
      this.highlight.position.set(this.target.x + 0.5, this.target.y + 0.5, this.target.z + 0.5);
      this.highlight.visible = true;
    } else {
      this.highlight.visible = false;
    }
  }

  /** Instantly break the targeted block. Returns the broken id, if any. */
  breakBlock(): BlockId | null {
    if (!this.target) return null;
    const { x, y, z } = this.target;
    const id = this.world.getBlock(x, y, z);
    if (id === BlockId.Air) return null;
    this.world.setBlock(x, y, z, BlockId.Air);
    return id;
  }

  /**
   * Place `id` against the targeted face. Rejected if the cell is solid or
   * the new block would intersect the player's AABB. Returns success.
   */
  placeBlock(id: BlockId): boolean {
    if (!this.target) return false;
    const x = this.target.x + this.target.nx;
    const y = this.target.y + this.target.ny;
    const z = this.target.z + this.target.nz;
    if (isSolid(this.world.getBlock(x, y, z))) return false;

    const p = this.player.position;
    const intersects =
      x + 1 > p.x - PLAYER_HALF_WIDTH &&
      x < p.x + PLAYER_HALF_WIDTH &&
      y + 1 > p.y &&
      y < p.y + PLAYER_HEIGHT &&
      z + 1 > p.z - PLAYER_HALF_WIDTH &&
      z < p.z + PLAYER_HALF_WIDTH;
    if (intersects) return false;

    this.world.setBlock(x, y, z, id);
    return true;
  }

  dispose(): void {
    this.highlight.geometry.dispose();
    (this.highlight.material as THREE.Material).dispose();
  }
}
