import type * as THREE from 'three';

export type EntityId = number;
export type EntityType = 'passive_mob';

/**
 * Minimal world-entity contract. Positions are feet-centered world coordinates;
 * velocity is measured in blocks per fixed 20 Hz tick.
 */
export interface Entity {
  readonly id: EntityId;
  readonly type: EntityType;
  readonly position: THREE.Vector3;
  readonly previousPosition: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly root: THREE.Object3D;
  yaw: number;
  pitch?: number;
  removed: boolean;

  tick(dtTicks: number): void;
  render(alpha: number): void;
  dispose(): void;
}
