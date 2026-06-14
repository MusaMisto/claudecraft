// Per-tick player physics: exact Minecraft-style vertical integration
// (jump 0.42, gravity 0.08, drag ×0.98) and a simplified horizontal model
// that converges to exact steady-state speeds. Collision is per-axis
// (Y, then X, then Z) AABB clamping against solid voxels, sub-stepped so
// fast movement cannot tunnel.
import { BlockId, isSolid } from '../world/Block';
import type { World } from '../world/World';
import { Player, PLAYER_HALF_WIDTH, PLAYER_HEIGHT, EYE_HEIGHT, SNEAK_EYE_HEIGHT } from './Player';
import type { MoveIntent } from './PlayerController';

const GRAVITY = 0.08; // blocks/tick²
const VERTICAL_DRAG = 0.98;
const JUMP_VELOCITY = 0.42; // blocks/tick

// Classic Minecraft water physics (PLAN.md §8.2): per tick in water, jump
// adds 0.04, horizontal acceleration is 0.02 × input, then ALL velocity is
// dragged ×0.8 and 0.02 of water gravity is subtracted from vy. Colliding
// horizontally grants a 0.3 boost to climb out onto a bank. Emergent steady
// states: sink −0.1 b/t (−2 m/s), rise +0.06 b/t (+1.2 m/s) holding jump.
const WATER_JUMP = 0.04;
const WATER_ACCEL = 0.02;
const WATER_DRAG = 0.8;
const WATER_GRAVITY = 0.02;
const WATER_CLIMB = 0.3;
// "In water" samples the AABB with the top deflated 0.4 (as Minecraft does):
// the head clears the surface before the feet do, which makes holding jump
// at the surface bob instead of launching out.
const WATER_TOP_DEFLATE = 0.4;

// Steady-state horizontal speeds in blocks/tick (m/s ÷ 20).
const WALK_SPEED = 4.317 / 20;
const SPRINT_SPEED = 5.612 / 20;
const SNEAK_SPEED = 1.295 / 20;
const FLY_SPEED = 10.89 / 20;
const FLY_SPRINT_SPEED = 21.6 / 20;
const FLY_VERTICAL_SPEED = 7.5 / 20;

// Per-tick lerp factors toward target velocity. Ground = 0.9 so releasing
// keys decays to < 0.01 m/s within ~3 ticks (0.1³ × 4.317 ≈ 0.004 m/s).
const GROUND_CONTROL = 0.9;
const AIR_CONTROL = 0.3;
const FLY_CONTROL = 0.5;

const COLLISION_EPS = 1e-7;
const SUBSTEP = 0.4; // max axis movement per collision substep (< 1 block)

export class PlayerPhysics {
  /** True when the last tick clamped downward (used to land out of flight). */
  private landed = false;
  /** True when the last tick clamped on X or Z (water climb-out assist). */
  private collidedHorizontally = false;

  constructor(
    private world: World,
    private player: Player,
  ) {}

  tick(intent: MoveIntent): void {
    const p = this.player;
    p.beginTick();

    p.sneaking = intent.sneak && !p.flying;
    p.eyeHeight += ((p.sneaking ? SNEAK_EYE_HEIGHT : EYE_HEIGHT) - p.eyeHeight) * 0.5;

    // Horizontal: accelerate toward wish velocity.
    const sin = Math.sin(p.yaw);
    const cos = Math.cos(p.yaw);
    let wishX = -sin * intent.forward + cos * intent.strafe;
    let wishZ = -cos * intent.forward - sin * intent.strafe;
    const len = Math.hypot(wishX, wishZ);
    if (len > 1) {
      wishX /= len;
      wishZ /= len;
    }
    const inWater = !p.flying && this.isInWater();
    p.inWater = inWater;

    if (inWater) {
      // Water: additive acceleration instead of the lerp-toward-target model.
      // The swim boost only applies while the head region is submerged, so
      // holding jump floats with eyes bobbing at the surface (like Minecraft)
      // instead of pushing the feet up to the surface plane. A grounded jump
      // in shallow water is a normal hop, stunted by the ×0.8 water drag.
      if (intent.jump) {
        if (this.waterAtHead()) p.velocity.y += WATER_JUMP;
        else if (p.onGround) p.velocity.y = JUMP_VELOCITY;
      }
      const accel = WATER_ACCEL * (p.sprinting ? 1.3 : 1) * (p.sneaking ? 0.3 : 1);
      p.velocity.x += wishX * accel;
      p.velocity.z += wishZ * accel;
    } else {
      const speed = p.flying
        ? p.sprinting
          ? FLY_SPRINT_SPEED
          : FLY_SPEED
        : p.sneaking
          ? SNEAK_SPEED
          : p.sprinting
            ? SPRINT_SPEED
            : WALK_SPEED;
      const control = p.flying ? FLY_CONTROL : p.onGround ? GROUND_CONTROL : AIR_CONTROL;
      p.velocity.x += (wishX * speed - p.velocity.x) * control;
      p.velocity.z += (wishZ * speed - p.velocity.z) * control;

      // Vertical.
      if (p.flying) {
        const wishY = (intent.flyUp ? 1 : 0) - (intent.flyDown ? 1 : 0);
        p.velocity.y += (wishY * FLY_VERTICAL_SPEED - p.velocity.y) * FLY_CONTROL;
      } else if (intent.jump && p.onGround) {
        p.velocity.y = JUMP_VELOCITY;
      }
    }

    // Move with collision: Y first, then X, then Z. Sneaking on the ground
    // refuses horizontal movement that would carry the player off an edge.
    const guardEdges = p.sneaking && p.onGround;
    this.landed = false;
    this.collidedHorizontally = false;
    p.onGround = false;
    this.moveAxis('y', p.velocity.y);
    this.moveAxis('x', p.velocity.x, guardEdges);
    this.moveAxis('z', p.velocity.z, guardEdges);

    if (p.flying && this.landed) {
      p.flying = false; // descending into the ground turns off flight
    }

    // Gravity + drag after movement (matches Minecraft's tick order:
    // jump 0.42 moves the full 0.42 on its first tick → apex ≈ 1.25).
    if (inWater) {
      // Swimming against a bank hops the player out of the water.
      if (this.collidedHorizontally) p.velocity.y = WATER_CLIMB;
      p.velocity.x *= WATER_DRAG;
      p.velocity.z *= WATER_DRAG;
      p.velocity.y = p.velocity.y * WATER_DRAG - WATER_GRAVITY;
    } else if (!p.flying) {
      p.velocity.y = (p.velocity.y - GRAVITY) * VERTICAL_DRAG;
    }

    // Kill tiny residual speeds so idle velocity is exactly zero.
    if (Math.abs(p.velocity.x) < 1e-5) p.velocity.x = 0;
    if (Math.abs(p.velocity.z) < 1e-5) p.velocity.z = 0;
  }

  private moveAxis(axis: 'x' | 'y' | 'z', amount: number, guardEdges = false): void {
    const p = this.player;
    const step = guardEdges ? 0.05 : SUBSTEP;
    let remaining = amount;
    while (remaining !== 0) {
      const d = Math.max(-step, Math.min(step, remaining));
      remaining -= d;
      const before = p.position[axis];
      p.position[axis] += d;
      this.resolveAxis(axis, d > 0);
      if (guardEdges && !this.hasGroundSupport()) {
        p.position[axis] = before; // would step off the edge — refuse
        p.velocity[axis] = 0;
        break;
      }
      if (p.velocity[axis] === 0) break; // clamped against something
    }
  }

  /** True if the AABB (top deflated 0.4, sides 0.001) overlaps water. */
  private isInWater(): boolean {
    const p = this.player;
    const x0 = Math.floor(p.position.x - PLAYER_HALF_WIDTH + 0.001);
    const x1 = Math.floor(p.position.x + PLAYER_HALF_WIDTH - 0.001);
    const y0 = Math.floor(p.position.y);
    const y1 = Math.floor(p.position.y + PLAYER_HEIGHT - WATER_TOP_DEFLATE);
    const z0 = Math.floor(p.position.z - PLAYER_HALF_WIDTH + 0.001);
    const z1 = Math.floor(p.position.z + PLAYER_HALF_WIDTH - 0.001);
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (this.world.getBlock(x, y, z) === BlockId.Water) return true;
        }
      }
    }
    return false;
  }

  /** True if the head region (top of the deflated water box) is in water. */
  private waterAtHead(): boolean {
    const p = this.player;
    const y = Math.floor(p.position.y + PLAYER_HEIGHT - WATER_TOP_DEFLATE);
    const x0 = Math.floor(p.position.x - PLAYER_HALF_WIDTH + 0.001);
    const x1 = Math.floor(p.position.x + PLAYER_HALF_WIDTH - 0.001);
    const z0 = Math.floor(p.position.z - PLAYER_HALF_WIDTH + 0.001);
    const z1 = Math.floor(p.position.z + PLAYER_HALF_WIDTH - 0.001);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (this.world.getBlock(x, y, z) === BlockId.Water) return true;
      }
    }
    return false;
  }

  /** True if any solid block lies directly under the AABB footprint. */
  private hasGroundSupport(): boolean {
    const p = this.player;
    const y = Math.floor(p.position.y - 0.05);
    const x0 = Math.floor(p.position.x - PLAYER_HALF_WIDTH);
    const x1 = Math.floor(p.position.x + PLAYER_HALF_WIDTH - COLLISION_EPS);
    const z0 = Math.floor(p.position.z - PLAYER_HALF_WIDTH);
    const z1 = Math.floor(p.position.z + PLAYER_HALF_WIDTH - COLLISION_EPS);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (isSolid(this.world.getBlock(x, y, z))) return true;
      }
    }
    return false;
  }

  /** Clamp the AABB out of any solid cell overlapped on this axis. */
  private resolveAxis(axis: 'x' | 'y' | 'z', positive: boolean): void {
    const p = this.player;
    const minX = p.position.x - PLAYER_HALF_WIDTH;
    const maxX = p.position.x + PLAYER_HALF_WIDTH;
    const minY = p.position.y;
    const maxY = p.position.y + PLAYER_HEIGHT;
    const minZ = p.position.z - PLAYER_HALF_WIDTH;
    const maxZ = p.position.z + PLAYER_HALF_WIDTH;

    const x0 = Math.floor(minX);
    const x1 = Math.floor(maxX - COLLISION_EPS);
    const y0 = Math.floor(minY);
    const y1 = Math.floor(maxY - COLLISION_EPS);
    const z0 = Math.floor(minZ);
    const z1 = Math.floor(maxZ - COLLISION_EPS);

    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (!isSolid(this.world.getBlock(x, y, z))) continue;
          if (axis === 'y') {
            if (positive) {
              p.position.y = y - PLAYER_HEIGHT - COLLISION_EPS;
            } else {
              p.position.y = y + 1;
              p.onGround = true;
              this.landed = true;
            }
            p.velocity.y = 0;
          } else if (axis === 'x') {
            p.position.x = positive ? x - PLAYER_HALF_WIDTH - COLLISION_EPS : x + 1 + PLAYER_HALF_WIDTH + COLLISION_EPS;
            p.velocity.x = 0;
            this.collidedHorizontally = true;
          } else {
            p.position.z = positive ? z - PLAYER_HALF_WIDTH - COLLISION_EPS : z + 1 + PLAYER_HALF_WIDTH + COLLISION_EPS;
            p.velocity.z = 0;
            this.collidedHorizontally = true;
          }
          return;
        }
      }
    }
  }
}
