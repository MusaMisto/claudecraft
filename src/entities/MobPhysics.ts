import * as THREE from 'three';
import { BlockId, isSolid } from '../world/Block';
import type { World } from '../world/World';

const GRAVITY = 0.08;
const VERTICAL_DRAG = 0.98;
const WATER_LIFT = 0.04;
const WATER_DRAG = 0.8;
const WATER_GRAVITY = 0.02;
const CONTROL = 0.45;
const WATER_CONTROL = 0.18;
const COLLISION_EPS = 1e-6;
const SUBSTEP = 0.35;
const STEP_HEIGHT = 1.01;

export interface MobBody {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  onGround: boolean;
  inWater: boolean;
}

export interface MobMotion {
  desiredX: number;
  desiredZ: number;
}

export class MobPhysics {
  collidedHorizontally = false;

  constructor(
    private readonly world: World,
    private readonly body: MobBody,
    readonly width: number,
    readonly height: number,
  ) {}

  tick(motion: MobMotion): void {
    const body = this.body;
    const wasGrounded = body.onGround || this.hasGroundSupport();
    body.inWater = this.overlapsWater();
    const control = body.inWater ? WATER_CONTROL : CONTROL;
    body.velocity.x += (motion.desiredX - body.velocity.x) * control;
    body.velocity.z += (motion.desiredZ - body.velocity.z) * control;
    if (body.inWater) body.velocity.y += WATER_LIFT;

    this.collidedHorizontally = false;
    body.onGround = false;
    this.moveAxis('y', body.velocity.y);
    this.moveHorizontal('x', body.velocity.x, wasGrounded);
    this.moveHorizontal('z', body.velocity.z, wasGrounded || body.onGround);
    if (!body.onGround) body.onGround = this.hasGroundSupport();

    if (body.inWater) {
      body.velocity.multiplyScalar(WATER_DRAG);
      body.velocity.y -= WATER_GRAVITY;
    } else {
      body.velocity.y = (body.velocity.y - GRAVITY) * VERTICAL_DRAG;
    }
    if (Math.abs(body.velocity.x) < 1e-4) body.velocity.x = 0;
    if (Math.abs(body.velocity.z) < 1e-4) body.velocity.z = 0;
  }

  private moveHorizontal(axis: 'x' | 'z', amount: number, canStep: boolean): void {
    if (amount === 0) return;
    const body = this.body;
    const start = body.position.clone();
    const velocity = body.velocity[axis];
    if (!this.moveAxis(axis, amount)) return;
    this.collidedHorizontally = true;
    if (!canStep) return;

    body.position.copy(start);
    body.velocity[axis] = velocity;
    body.position.y += STEP_HEIGHT;
    if (this.intersectsSolid() || this.moveAxis(axis, amount)) {
      body.position.copy(start);
      body.velocity[axis] = 0;
      return;
    }

    body.onGround = false;
    this.moveAxis('y', -STEP_HEIGHT - 0.05);
    if (!body.onGround) {
      body.position.copy(start);
      body.velocity[axis] = 0;
    }
  }

  /** Move in substeps; returns true when a solid voxel clamps the body. */
  private moveAxis(axis: 'x' | 'y' | 'z', amount: number): boolean {
    const body = this.body;
    let remaining = amount;
    while (Math.abs(remaining) > COLLISION_EPS) {
      const delta = Math.max(-SUBSTEP, Math.min(SUBSTEP, remaining));
      remaining -= delta;
      body.position[axis] += delta;
      if (!this.resolveAxis(axis, delta > 0)) continue;
      body.velocity[axis] = 0;
      return true;
    }
    return false;
  }

  private resolveAxis(axis: 'x' | 'y' | 'z', positive: boolean): boolean {
    const body = this.body;
    const half = this.width * 0.5;
    const minX = body.position.x - half;
    const maxX = body.position.x + half;
    const minY = body.position.y;
    const maxY = body.position.y + this.height;
    const minZ = body.position.z - half;
    const maxZ = body.position.z + half;

    for (let y = Math.floor(minY); y <= Math.floor(maxY - COLLISION_EPS); y++) {
      for (let z = Math.floor(minZ); z <= Math.floor(maxZ - COLLISION_EPS); z++) {
        for (let x = Math.floor(minX); x <= Math.floor(maxX - COLLISION_EPS); x++) {
          if (!isSolid(this.world.getBlock(x, y, z))) continue;
          if (axis === 'y') {
            body.position.y = positive ? y - this.height - COLLISION_EPS : y + 1;
            if (!positive) body.onGround = true;
          } else if (axis === 'x') {
            body.position.x = positive ? x - half - COLLISION_EPS : x + 1 + half + COLLISION_EPS;
          } else {
            body.position.z = positive ? z - half - COLLISION_EPS : z + 1 + half + COLLISION_EPS;
          }
          return true;
        }
      }
    }
    return false;
  }

  private intersectsSolid(): boolean {
    const body = this.body;
    const half = this.width * 0.5;
    for (let y = Math.floor(body.position.y); y <= Math.floor(body.position.y + this.height - COLLISION_EPS); y++) {
      for (let z = Math.floor(body.position.z - half); z <= Math.floor(body.position.z + half - COLLISION_EPS); z++) {
        for (let x = Math.floor(body.position.x - half); x <= Math.floor(body.position.x + half - COLLISION_EPS); x++) {
          if (isSolid(this.world.getBlock(x, y, z))) return true;
        }
      }
    }
    return false;
  }

  private hasGroundSupport(): boolean {
    const body = this.body;
    const half = this.width * 0.5;
    const y = Math.floor(body.position.y - 0.06);
    for (let z = Math.floor(body.position.z - half); z <= Math.floor(body.position.z + half - COLLISION_EPS); z++) {
      for (let x = Math.floor(body.position.x - half); x <= Math.floor(body.position.x + half - COLLISION_EPS); x++) {
        if (isSolid(this.world.getBlock(x, y, z))) return true;
      }
    }
    return false;
  }

  private overlapsWater(): boolean {
    const body = this.body;
    const half = this.width * 0.5;
    for (let y = Math.floor(body.position.y); y <= Math.floor(body.position.y + this.height * 0.8); y++) {
      for (let z = Math.floor(body.position.z - half); z <= Math.floor(body.position.z + half - COLLISION_EPS); z++) {
        for (let x = Math.floor(body.position.x - half); x <= Math.floor(body.position.x + half - COLLISION_EPS); x++) {
          if (this.world.getBlock(x, y, z) === BlockId.Water) return true;
        }
      }
    }
    return false;
  }
}
