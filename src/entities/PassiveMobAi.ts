import * as THREE from 'three';
import type { Rng } from '../core/Rng';
import { BlockId, isSolid } from '../world/Block';
import type { World } from '../world/World';
import {
  ANIMAL_SPECS,
  type AnimalKind,
  type PassiveMobState,
} from './AnimalTypes';
import type { MobMotion } from './MobPhysics';

interface AiBody {
  readonly position: THREE.Vector3;
  yaw: number;
  headYaw: number;
  state: PassiveMobState;
  inWater: boolean;
  onGround: boolean;
  physics: { collidedHorizontally: boolean };
}

export class PassiveMobAi {
  private timer = 20;
  private targetYaw = 0;
  private lookYaw = 0;
  private stuckTicks = 0;
  private readonly lastPosition = new THREE.Vector3();

  constructor(
    private readonly world: World,
    private readonly body: AiBody,
    private readonly kind: AnimalKind,
    private readonly rng: Rng,
  ) {
    this.targetYaw = body.yaw;
    this.lastPosition.copy(body.position);
  }

  tick(dtTicks: number): MobMotion {
    const body = this.body;
    const movedSq = body.position.distanceToSquared(this.lastPosition);
    this.lastPosition.copy(body.position);
    this.timer -= dtTicks;

    if (body.inWater) {
      if (body.state !== 'swimming') this.enter('swimming', 30 + this.roll(50));
      return this.swim();
    }
    if (body.state === 'swimming') this.enter('idle', 12 + this.roll(25));

    if (
      body.state === 'wandering' &&
      (body.physics.collidedHorizontally || movedSq < 0.000004)
    ) {
      this.stuckTicks++;
      if (this.stuckTicks > 12) this.enter('stuck', 10 + this.roll(12));
    } else {
      this.stuckTicks = 0;
    }

    if (body.state === 'stuck') return this.recover();
    if (body.state === 'wandering') return this.wander();
    if (body.state === 'looking') return this.look();
    return this.idle();
  }

  private idle(): MobMotion {
    this.body.headYaw *= 0.82;
    if (this.timer <= 0) {
      if (this.rng() < 0.42) {
        this.lookYaw = (this.rng() - 0.5) * 1.25;
        this.enter('looking', 24 + this.roll(45));
      } else {
        this.targetYaw = this.body.yaw + (this.rng() - 0.5) * Math.PI * 1.6;
        this.enter('wandering', 45 + this.roll(115));
      }
    }
    return { desiredX: 0, desiredZ: 0 };
  }

  private look(): MobMotion {
    this.body.headYaw += (this.lookYaw - this.body.headYaw) * 0.13;
    if (this.timer <= 0) this.enter('idle', 25 + this.roll(80));
    return { desiredX: 0, desiredZ: 0 };
  }

  private wander(): MobMotion {
    const body = this.body;
    body.yaw = turnToward(body.yaw, this.targetYaw, 0.075);
    body.headYaw += (Math.sin(this.timer * 0.08) * 0.1 - body.headYaw) * 0.12;
    if (this.timer <= 0) {
      this.enter('idle', 30 + this.roll(100));
      return { desiredX: 0, desiredZ: 0 };
    }
    if (!this.safeAhead(body.yaw)) {
      this.enter('stuck', 10 + this.roll(10));
      return { desiredX: 0, desiredZ: 0 };
    }
    return motionFor(body.yaw, ANIMAL_SPECS[this.kind].walkSpeed / 20);
  }

  private recover(): MobMotion {
    const body = this.body;
    if (this.timer <= 0) {
      this.targetYaw = body.yaw + (this.rng() < 0.5 ? -1 : 1) * (1.2 + this.rng() * 1.4);
      this.enter('wandering', 35 + this.roll(70));
      return { desiredX: 0, desiredZ: 0 };
    }
    body.yaw += (this.rng() < 0.5 ? -1 : 1) * 0.035;
    body.headYaw *= 0.8;
    return motionFor(body.yaw + Math.PI, ANIMAL_SPECS[this.kind].walkSpeed / 60);
  }

  private swim(): MobMotion {
    const body = this.body;
    if (this.timer <= 0 || !this.safeAhead(this.targetYaw, true)) {
      this.targetYaw = this.findLandYaw() ?? body.yaw + (this.rng() - 0.5) * Math.PI;
      this.timer = 28 + this.roll(45);
    }
    body.yaw = turnToward(body.yaw, this.targetYaw, 0.1);
    body.headYaw *= 0.8;
    return motionFor(body.yaw, ANIMAL_SPECS[this.kind].walkSpeed / 34);
  }

  private safeAhead(yaw: number, swimming = false): boolean {
    const body = this.body;
    const spec = ANIMAL_SPECS[this.kind];
    const distance = spec.width * 0.6 + 0.55;
    const x = body.position.x - Math.sin(yaw) * distance;
    const z = body.position.z - Math.cos(yaw) * distance;
    const feetY = Math.floor(body.position.y);
    const lower = this.world.getBlock(Math.floor(x), feetY, Math.floor(z));
    const upper = this.world.getBlock(
      Math.floor(x),
      Math.floor(body.position.y + spec.height * 0.82),
      Math.floor(z),
    );
    if (isSolid(upper)) return false;
    if (isSolid(lower)) {
      const above = this.world.getBlock(Math.floor(x), feetY + 1, Math.floor(z));
      if (isSolid(above)) return false;
    }
    if (!swimming && (lower === BlockId.Water || this.world.getBlock(Math.floor(x), feetY - 1, Math.floor(z)) === BlockId.Water)) {
      return false;
    }
    if (swimming) return true;
    return this.hasSafeGround(x, body.position.y, z);
  }

  private hasSafeGround(x: number, feetY: number, z: number): boolean {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    for (let y = Math.floor(feetY); y >= Math.floor(feetY) - 2; y--) {
      if (isSolid(this.world.getBlock(bx, y, bz))) {
        return y + 1 >= feetY - 1.05;
      }
    }
    return false;
  }

  private findLandYaw(): number | null {
    const body = this.body;
    const y = Math.floor(body.position.y);
    for (let i = 0; i < 8; i++) {
      const yaw = (i / 8) * Math.PI * 2 + this.rng() * 0.25;
      const x = Math.floor(body.position.x - Math.sin(yaw) * 3);
      const z = Math.floor(body.position.z - Math.cos(yaw) * 3);
      const atFeet = this.world.getBlock(x, y, z);
      const below = this.world.getBlock(x, y - 1, z);
      if (atFeet !== BlockId.Water && isSolid(below)) return yaw;
    }
    return null;
  }

  private enter(state: PassiveMobState, timer: number): void {
    this.body.state = state;
    this.timer = timer;
    if (state !== 'wandering') this.stuckTicks = 0;
  }

  private roll(max: number): number {
    return Math.floor(this.rng() * max);
  }
}

function motionFor(yaw: number, speed: number): MobMotion {
  return {
    desiredX: -Math.sin(yaw) * speed,
    desiredZ: -Math.cos(yaw) * speed,
  };
}

function turnToward(current: number, target: number, maxStep: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + THREE.MathUtils.clamp(delta, -maxStep, maxStep);
}
