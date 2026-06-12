// Player state: feet-centered position, per-tick velocity, look angles, flags.
import * as THREE from 'three';

export const PLAYER_HALF_WIDTH = 0.3; // 0.6 m footprint
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
export const SNEAK_EYE_HEIGHT = 1.5;

export class Player {
  /** Feet position (center of the hitbox footprint), 1 unit = 1 block. */
  readonly position = new THREE.Vector3();
  /** Position at the previous tick, for render interpolation. */
  readonly prevPosition = new THREE.Vector3();
  /** Velocity in blocks per tick. */
  readonly velocity = new THREE.Vector3();

  yaw = 0; // radians, 0 = looking toward -Z
  pitch = 0;

  onGround = false;
  flying = false;
  sprinting = false;
  sneaking = false;
  /** Current camera eye height (eased toward 1.62 or 1.5 while sneaking). */
  eyeHeight = EYE_HEIGHT;

  /** Snapshot previous position at the start of each tick. */
  beginTick(): void {
    this.prevPosition.copy(this.position);
  }

  teleport(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.prevPosition.set(x, y, z);
    this.velocity.set(0, 0, 0);
  }

  /** Interpolated feet position for rendering. */
  interpolated(alpha: number, out: THREE.Vector3): THREE.Vector3 {
    return out.lerpVectors(this.prevPosition, this.position, alpha);
  }

  /** Horizontal speed in m/s (blocks/tick × 20). */
  get horizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z) * 20;
  }
}
