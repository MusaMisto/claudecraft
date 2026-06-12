// Per-tick player physics: exact Minecraft-style vertical integration
// (jump 0.42, gravity 0.08, drag ×0.98) and a simplified horizontal model
// that converges to exact steady-state speeds. Collision is per-axis
// (Y, then X, then Z) AABB clamping against solid voxels, sub-stepped so
// fast movement cannot tunnel.
import { isSolid } from '../world/Block';
import type { World } from '../world/World';
import { Player, PLAYER_HALF_WIDTH, PLAYER_HEIGHT } from './Player';
import type { MoveIntent } from './PlayerController';

const GRAVITY = 0.08; // blocks/tick²
const VERTICAL_DRAG = 0.98;
const JUMP_VELOCITY = 0.42; // blocks/tick

// Steady-state horizontal speeds in blocks/tick (m/s ÷ 20).
const WALK_SPEED = 4.317 / 20;
const SPRINT_SPEED = 5.612 / 20;
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

  constructor(
    private world: World,
    private player: Player,
  ) {}

  tick(intent: MoveIntent): void {
    const p = this.player;
    p.beginTick();

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
    const speed = p.flying
      ? p.sprinting
        ? FLY_SPRINT_SPEED
        : FLY_SPEED
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

    // Move with collision: Y first, then X, then Z.
    this.landed = false;
    p.onGround = false;
    this.moveAxis('y', p.velocity.y);
    this.moveAxis('x', p.velocity.x);
    this.moveAxis('z', p.velocity.z);

    if (p.flying && this.landed) {
      p.flying = false; // descending into the ground turns off flight
    }

    // Gravity + drag after movement (matches Minecraft's tick order:
    // jump 0.42 moves the full 0.42 on its first tick → apex ≈ 1.25).
    if (!p.flying) {
      p.velocity.y = (p.velocity.y - GRAVITY) * VERTICAL_DRAG;
    }

    // Kill tiny residual speeds so idle velocity is exactly zero.
    if (Math.abs(p.velocity.x) < 1e-5) p.velocity.x = 0;
    if (Math.abs(p.velocity.z) < 1e-5) p.velocity.z = 0;
  }

  private moveAxis(axis: 'x' | 'y' | 'z', amount: number): void {
    const p = this.player;
    let remaining = amount;
    while (remaining !== 0) {
      const d = Math.max(-SUBSTEP, Math.min(SUBSTEP, remaining));
      remaining -= d;
      p.position[axis] += d;
      this.resolveAxis(axis, d > 0);
      if (p.velocity[axis] === 0) break; // clamped against something
    }
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
          } else {
            p.position.z = positive ? z - PLAYER_HALF_WIDTH - COLLISION_EPS : z + 1 + PLAYER_HALF_WIDTH + COLLISION_EPS;
            p.velocity.z = 0;
          }
          return;
        }
      }
    }
  }
}
