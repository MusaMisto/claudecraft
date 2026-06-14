import * as THREE from 'three';
import type { Entity, EntityId } from './Entity';
import {
  ANIMAL_SPECS,
  type AnimalKind,
  type ClimateVariant,
  type PassiveMobState,
  type SheepWoolColor,
} from './AnimalTypes';
import { MobPhysics } from './MobPhysics';
import type { MobRenderer, MobVisual } from './MobRenderer';
import type { World } from '../world/World';
import { mulberry32 } from '../core/Rng';
import { PassiveMobAi } from './PassiveMobAi';
import type { Rng } from '../core/Rng';

export interface PassiveMobSpawn {
  id: EntityId;
  kind: AnimalKind;
  variant: ClimateVariant;
  woolColor: SheepWoolColor;
  position: THREE.Vector3;
  yaw: number;
  homeChunk: string;
  aiSeed: number;
}

export class PassiveMob implements Entity {
  readonly type = 'passive_mob' as const;
  readonly position = new THREE.Vector3();
  readonly spawnPosition = new THREE.Vector3();
  readonly previousPosition = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly root: THREE.Object3D;
  readonly kind: AnimalKind;
  readonly variant: ClimateVariant;
  readonly woolColor: SheepWoolColor;
  readonly homeChunk: string;
  readonly visual: MobVisual;
  readonly physics: MobPhysics;
  readonly ai: PassiveMobAi;
  private readonly soundRng: Rng;
  private soundTicks: number;
  state: PassiveMobState = 'idle';
  yaw: number;
  previousYaw: number;
  headYaw = 0;
  removed = false;
  onGround = false;
  inWater = false;
  ageTicks = 0;

  constructor(
    readonly id: EntityId,
    world: World,
    renderer: MobRenderer,
    spawn: PassiveMobSpawn,
    private readonly playIdleSound: (kind: AnimalKind, position: THREE.Vector3) => boolean,
  ) {
    this.kind = spawn.kind;
    this.variant = spawn.variant;
    this.woolColor = spawn.woolColor;
    this.homeChunk = spawn.homeChunk;
    this.position.copy(spawn.position);
    this.spawnPosition.copy(spawn.position);
    this.previousPosition.copy(spawn.position);
    this.yaw = spawn.yaw;
    this.previousYaw = spawn.yaw;
    this.visual = renderer.create(spawn.kind, spawn.variant, spawn.woolColor);
    this.root = this.visual.root;
    const spec = ANIMAL_SPECS[spawn.kind];
    this.physics = new MobPhysics(world, this, spec.width, spec.height);
    this.ai = new PassiveMobAi(world, this, spawn.kind, mulberry32(spawn.aiSeed));
    this.soundRng = mulberry32(spawn.aiSeed ^ 0x6d2b79f5);
    this.soundTicks = this.nextSoundCooldown();
  }

  tick(dtTicks: number): void {
    this.previousPosition.copy(this.position);
    this.previousYaw = this.yaw;
    this.physics.tick(this.ai.tick(dtTicks));
    this.ageTicks += dtTicks;
    this.soundTicks -= dtTicks;
    if (this.soundTicks <= 0) {
      this.playIdleSound(this.kind, this.position);
      this.soundTicks = this.nextSoundCooldown();
    }
  }

  render(alpha: number): void {
    this.root.position.lerpVectors(this.previousPosition, this.position, alpha);
    this.root.rotation.y = interpolateAngle(this.previousYaw, this.yaw, alpha);
    this.visual.animate(
      this.ageTicks + alpha,
      Math.hypot(this.velocity.x, this.velocity.z),
      this.headYaw,
      this.state,
    );
  }

  dispose(): void {
    this.root.clear();
  }

  private nextSoundCooldown(): number {
    const ranges: Record<AnimalKind, [number, number]> = {
      cow: [160, 500],
      sheep: [140, 440],
      pig: [120, 400],
      chicken: [100, 360],
    };
    const [min, max] = ranges[this.kind];
    return min + Math.floor(this.soundRng() * (max - min + 1));
  }
}

function interpolateAngle(from: number, to: number, alpha: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * alpha;
}
